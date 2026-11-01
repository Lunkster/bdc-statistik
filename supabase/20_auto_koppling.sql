-- 20: Automatisk koppling av "Förnamn X" (2026-11-01)
--
-- Klubbens regel från 2026-11-01: i n01 skrivs förnamn + efternamnsinitial, t.ex. "Pontus W".
-- När en tävling hämtas och ett namn i den formen saknar koppling, kopplas det direkt (allmän
-- koppling, gäller alla tävlingar) om exakt EN spelare passar:
--   * förnamnet = spelarens förnamn, första ordet i visningsnamnet eller ett namn som redan är
--     kopplat till spelaren (smeknamn, t.ex. "Micke" → Mikael Linell; "Micke 5" räknas som "Micke"), och
--   * spelarens efternamn börjar på initialen (en eller två bokstäver, ev. med punkt: "Pontus W.", "Linus JP").
-- Passar ingen eller flera hamnar namnet som förut under Admin → Koppla namn.
-- Kopplingen loggas i ändringsloggen som "kopplad automatiskt".

-- Ändringsloggen: skilj automatiska kopplingar från admins
create or replace function public.logga_alias() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.alias_logg (handling, n01_namn, tdid, till_spelare)
    values (case when current_setting('bdc.auto_koppling', true) = '1' then 'kopplad automatiskt' else 'kopplad' end,
            new.n01_namn, new.tdid, new.spelare_id);
  elsif tg_op = 'UPDATE' and new.spelare_id is distinct from old.spelare_id then
    insert into public.alias_logg (handling, n01_namn, tdid, fran_spelare, till_spelare) values ('flyttad', new.n01_namn, new.tdid, old.spelare_id, new.spelare_id);
  elsif tg_op = 'DELETE' then
    insert into public.alias_logg (handling, n01_namn, tdid, fran_spelare) values ('borttagen', old.n01_namn, old.tdid, old.spelare_id);
  end if;
  return null;
end $$;

-- Vilken spelare passar ett n01-namn? null om namnet inte har formen "Förnamn X" eller om ingen/flera passar.
create or replace function public.forslag_spelare(namn text) returns integer
  language sql stable security definer set search_path = '' as $$
  with delar as (
    select m[1] as fornamn, m[2] as initial
    from regexp_match(btrim(namn), '^([[:alpha:]-]+)\s+([[:alpha:]]{1,2})\.?$') m
  ), kandidat as (
    select distinct s.id
    from delar d
    join public.spelare s on s.aktiv and s.efternamn is not null
      and lower(s.efternamn) like lower(d.initial) || '%'
    where lower(s.fornamn) = lower(d.fornamn)
       or lower(split_part(btrim(s.visningsnamn), ' ', 1)) = lower(d.fornamn)
       or exists (select 1 from public.alias a where a.spelare_id = s.id
                    and lower(regexp_replace(btrim(a.n01_namn), '\s+\d+$', '')) = lower(d.fornamn))
  )
  select case when count(*) = 1 then min(id) end from kandidat;
$$;
revoke all on function public.forslag_spelare(text) from public, anon;
grant execute on function public.forslag_spelare(text) to authenticated;

-- Körs för varje deltagare som hämtningen lägger in (hämtningen tar bort och lägger in deltagarna på nytt)
create or replace function public.auto_koppla_deltagare() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare sid integer;
begin
  if exists (select 1 from public.alias a
             where lower(btrim(a.n01_namn)) = lower(btrim(new.namn)) and (a.tdid is null or a.tdid = new.tdid)) then
    return null;                                   -- redan kopplat (allmänt eller för tävlingen)
  end if;
  sid := public.forslag_spelare(new.namn);
  if sid is not null then
    perform set_config('bdc.auto_koppling', '1', true);
    insert into public.alias (n01_namn, tdid, spelare_id) values (btrim(new.namn), null, sid)
      on conflict do nothing;
    perform set_config('bdc.auto_koppling', '', true);
  end if;
  return null;
end $$;
revoke all on function public.auto_koppla_deltagare() from public, anon, authenticated;

drop trigger if exists auto_koppla on public.deltagare;
create trigger auto_koppla after insert on public.deltagare
  for each row execute function public.auto_koppla_deltagare();
