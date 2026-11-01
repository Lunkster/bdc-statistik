-- 19: Stängda cuper och säker ihopslagning av spelare (2026-11-01)
--
-- Bakgrund: poängtabellen räknas live ur regler, serie/period, tavling_val, poang_manuell och alias.
-- Ingenting hindrade att en avslutad cups ställning ändrades i efterhand, och sla_ihop_spelare
-- raderade tyst inmatade bull-poäng och distriktsserie-kopplingar (poang_manuell.spelare_id och
-- ds_alias.spelare_id har on delete cascade, men funktionen flyttade bara alias).
--
-- Princip: vad poängen är värda och vilka turneringar som räknas låses när cupen stängs.
-- Vem poängen tillhör (alias, ihopslagning av spelare) är fortfarande fritt, så att felkopplingar går att rätta.
-- Inga härledda värden lagras (se CLAUDE.md) – ställningen räknas fortfarande live.

-- ---------- 1. Ihopslagning flyttar allt som pekar på spelaren ----------
create or replace function public.sla_ihop_spelare(fran integer, till integer) returns void
  language plpgsql security definer set search_path = '' as $$
declare f public.spelare;
begin
  if not public.ar_admin() then raise exception 'Bara admin får slå ihop spelare'; end if;
  if fran = till then raise exception 'Välj två olika spelare'; end if;
  select * into f from public.spelare where id = fran;
  if not found or not exists (select 1 from public.spelare where id = till) then raise exception 'Spelaren finns inte'; end if;
  update public.alias         set spelare_id = till where spelare_id = fran;
  update public.poang_manuell set spelare_id = till where spelare_id = fran;   -- bull-utgångar (ändrades inte förut)
  update public.ds_alias      set spelare_id = till where spelare_id = fran;   -- lagmedlemmar i distriktsserien (ändrades inte förut)
  update public.spelare s set
    medlemsnummer = coalesce(s.medlemsnummer, f.medlemsnummer),
    fornamn = coalesce(s.fornamn, f.fornamn), efternamn = coalesce(s.efternamn, f.efternamn),
    kommentar = nullif(concat_ws(' · ', s.kommentar, f.kommentar), '')
  where s.id = till;
  update public.spelare set medlemsnummer = null where id = fran;   -- undvik krock på unik nyckel
  delete from public.spelare where id = fran;
  insert into public.alias_logg (handling, n01_namn, fran_spelare, till_spelare) values ('ihopslagen', f.namn, fran, till);
end $$;

-- Borttagning av spelare: ds_alias kontrolleras också (annars raderas lagmedlemskopplingen tyst)
create or replace function public.ta_bort_spelare(sid integer) returns void
  language plpgsql security definer set search_path = '' as $$
declare s public.spelare;
begin
  if not public.ar_admin() then raise exception 'Bara admin får ta bort spelare'; end if;
  select * into s from public.spelare where id = sid;
  if not found then raise exception 'Spelaren finns inte'; end if;
  if s.aktiv then raise exception 'Markera spelaren som inaktiv först'; end if;
  if exists (select 1 from public.alias where spelare_id = sid) then raise exception 'Spelaren har kopplade n01-namn – flytta eller ta bort dem först'; end if;
  if exists (select 1 from public.poang_manuell where spelare_id = sid) then raise exception 'Spelaren har inmatade cuppoäng – ta bort dem först'; end if;
  if exists (select 1 from public.ds_alias where spelare_id = sid) then raise exception 'Spelaren är kopplad som lagmedlem i distriktsserien – flytta eller ta bort kopplingen först'; end if;
  delete from public.spelare where id = sid;
  insert into public.alias_logg (handling, n01_namn, fran_spelare) values ('spelare borttagen', s.namn, sid);
end $$;

-- ---------- 2. Stängd cup ----------
-- Bara admin kan ändra tavling (RLS), alltså också stänga och öppna igen.
alter table public.tavling add column stangd boolean not null default false;
comment on column public.tavling.stangd is 'Stängd cup: regler, period, serie, turneringsval och bull-poäng är låsta. Alias och spelare kan fortfarande ändras.';

-- tavling: typ, serie, period, n01_lgid, kvalgräns och regler låses. Namn, aktiv och kommentar är fria.
-- Själva stängningen (stangd false → true) och återöppningen (true → false) går alltid att göra.
create or replace function public.tavling_las() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.stangd then raise exception 'Cupen är stängd – öppna den igen innan den tas bort'; end if;
    return old;
  end if;
  if old.stangd and new.stangd and (
       new.typ        is distinct from old.typ
    or new.serie      is distinct from old.serie
    or new.fran       is distinct from old.fran
    or new.till       is distinct from old.till
    or new.n01_lgid   is distinct from old.n01_lgid
    or new.kvalgrans  is distinct from old.kvalgrans
    or new.regler     is distinct from old.regler) then
    raise exception 'Cupen är stängd – öppna den igen för att ändra regler, period, serie eller kvalgräns';
  end if;
  return new;
end $$;

create trigger tavling_las before update or delete on public.tavling
  for each row execute function public.tavling_las();

-- tavling_val: vilka turneringar som är med (final, omgång, utesluten) kan inte ändras i en stängd cup
create or replace function public.tavling_val_las() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare cuper integer[];
begin
  if tg_op = 'INSERT' then cuper := array[new.tavling_id];
  elsif tg_op = 'DELETE' then cuper := array[old.tavling_id];
  else cuper := array[old.tavling_id, new.tavling_id];
  end if;
  if exists (select 1 from public.tavling t where t.stangd and t.id = any (cuper)) then
    raise exception 'Cupen är stängd – öppna den igen för att ändra vilka turneringar som räknas';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger tavling_val_las before insert or update or delete on public.tavling_val
  for each row execute function public.tavling_val_las();

-- poang_manuell: i en stängd cup kan rader varken läggas till, tas bort eller få nytt antal.
-- Vem raden gäller (spelare_id, n01_namn) får ändras – det är det som ihopslagning av spelare gör.
create or replace function public.poang_manuell_las() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.tavling t where t.stangd and t.id = new.tavling_id) then
      raise exception 'Cupen är stängd – öppna den igen för att lägga till bull-utgångar';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.tavling t where t.stangd and t.id = old.tavling_id) then
      raise exception 'Cupen är stängd – öppna den igen för att ta bort bull-utgångar';
    end if;
    return old;
  end if;
  if (new.tavling_id is distinct from old.tavling_id or new.antal is distinct from old.antal or new.kategori is distinct from old.kategori)
     and exists (select 1 from public.tavling t where t.stangd and t.id in (old.tavling_id, new.tavling_id)) then
    raise exception 'Cupen är stängd – öppna den igen för att ändra bull-utgångar';
  end if;
  return new;
end $$;

create trigger poang_manuell_las before insert or update or delete on public.poang_manuell
  for each row execute function public.poang_manuell_las();

-- Triggerfunktionerna ska inte kunna anropas via API:et (som i 13)
revoke execute on function public.tavling_las()        from public, anon, authenticated;
revoke execute on function public.tavling_val_las()    from public, anon, authenticated;
revoke execute on function public.poang_manuell_las()  from public, anon, authenticated;
