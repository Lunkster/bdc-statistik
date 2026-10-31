-- 10: Adminsidan – förnamn/efternamn, ändringslogg för kopplingar, slå ihop spelare (2026-10-31)

-- Förnamn och efternamn. namn (fullständigt namn) sätts av en trigger när någon av dem finns.
alter table public.spelare add column if not exists fornamn text, add column if not exists efternamn text;
update public.spelare set
  fornamn   = split_part(namn, ' ', 1),
  efternamn = nullif(btrim(substr(namn, length(split_part(namn, ' ', 1)) + 1)), '')
where fornamn is null;

create or replace function public.spelare_namn() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.fornamn := nullif(btrim(new.fornamn), '');
  new.efternamn := nullif(btrim(new.efternamn), '');
  new.medlemsnummer := nullif(btrim(new.medlemsnummer), '');
  if new.fornamn is not null or new.efternamn is not null then
    new.namn := btrim(concat_ws(' ', new.fornamn, new.efternamn));
  end if;
  return new;
end $$;
create trigger spelare_namn before insert or update on public.spelare
  for each row execute function public.spelare_namn();

-- Ändringslogg för kopplingar (alias). Kontot är delat, så loggen visar när och vad – inte vem.
create table public.alias_logg (
  id          integer generated always as identity primary key,
  tid         timestamptz not null default now(),
  handling    text not null,                 -- kopplad, flyttad, borttagen, ihopslagen
  n01_namn    text,
  tdid        text,
  fran_spelare integer,
  till_spelare integer,
  konto       text default (auth.jwt() ->> 'email')
);
alter table public.alias_logg enable row level security;
create policy "medlem läser" on public.alias_logg for select to authenticated using ((select public.ar_medlem()));
create index on public.alias_logg (tid desc);

create or replace function public.logga_alias() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.alias_logg (handling, n01_namn, tdid, till_spelare) values ('kopplad', new.n01_namn, new.tdid, new.spelare_id);
  elsif tg_op = 'UPDATE' and new.spelare_id is distinct from old.spelare_id then
    insert into public.alias_logg (handling, n01_namn, tdid, fran_spelare, till_spelare) values ('flyttad', new.n01_namn, new.tdid, old.spelare_id, new.spelare_id);
  elsif tg_op = 'DELETE' then
    insert into public.alias_logg (handling, n01_namn, tdid, fran_spelare) values ('borttagen', old.n01_namn, old.tdid, old.spelare_id);
  end if;
  return null;
end $$;
create trigger alias_logg after insert or update or delete on public.alias
  for each row execute function public.logga_alias();

-- Slå ihop två spelare: alla kopplingar flyttas från "fran" till "till", sedan tas "fran" bort.
-- Medlemsnummer och namnfält som saknas hos "till" tas från "fran".
create or replace function public.sla_ihop_spelare(fran integer, till integer) returns void
  language plpgsql security definer set search_path = '' as $$
declare f public.spelare;
begin
  if not public.ar_admin() then raise exception 'Bara admin får slå ihop spelare'; end if;
  if fran = till then raise exception 'Välj två olika spelare'; end if;
  select * into f from public.spelare where id = fran;
  if not found or not exists (select 1 from public.spelare where id = till) then raise exception 'Spelaren finns inte'; end if;
  update public.alias set spelare_id = till where spelare_id = fran;
  update public.spelare s set
    medlemsnummer = coalesce(s.medlemsnummer, f.medlemsnummer),
    fornamn = coalesce(s.fornamn, f.fornamn), efternamn = coalesce(s.efternamn, f.efternamn),
    kommentar = nullif(concat_ws(' · ', s.kommentar, f.kommentar), '')
  where s.id = till;
  update public.spelare set medlemsnummer = null where id = fran;   -- undvik krock på unik nyckel
  delete from public.spelare where id = fran;
  insert into public.alias_logg (handling, n01_namn, fran_spelare, till_spelare) values ('ihopslagen', f.namn, fran, till);
end $$;
revoke execute on function public.sla_ihop_spelare(integer, integer) from public, anon;
grant execute on function public.sla_ihop_spelare(integer, integer) to authenticated;

-- Underlag för att koppla ett n01-namn: en rad per turnering och namn, med koppling och snitt
create or replace view public.v_namn_underlag with (security_invoker = true) as
select d.namn, d.tdid, t.datum, t.serie, t.omgang, d.tpid,
       at.spelare_id as spelare_har, aa.spelare_id as spelare_allmant,
       coalesce(at.spelare_id, aa.spelare_id) as spelare_id,
       s.snitt, s.placering, s.matcher
from public.deltagare d
join public.turnering t on t.tdid = d.tdid
left join public.alias at on at.tdid = d.tdid and lower(btrim(at.n01_namn)) = lower(btrim(d.namn))
left join public.alias aa on aa.tdid is null and lower(btrim(aa.n01_namn)) = lower(btrim(d.namn))
left join public.v_turnering_statistik s on s.tdid = d.tdid and s.tpid = d.tpid;
revoke insert, update, delete, truncate, references, trigger on public.v_namn_underlag from authenticated;
