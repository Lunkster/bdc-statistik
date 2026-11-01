-- 18: Klubbrekord (v0.8.0, 2026-11-01)
-- Rundorna summerade per leg och sida i en materialiserad vy (som intern.match_kast), så att
-- rekordsidan och karusellen svarar snabbt. Räknas om av public.uppdatera_statistik() efter hämtning.
-- start = sidans startpoäng i leget (första rundans poäng + kvar) – 501, 301 eller handikapp 301–421.

create materialized view intern.leg_kast as
select k.mid, k.leg_nr, k.sida,
       sum(k.pilar)::int                                   as pilar,
       sum(k.poang)::int                                   as poang,
       min(k.kvar + k.poang) filter (where k.runda = 1)    as start,
       max(k.poang) filter (where k.utgang)                as utgang,
       count(*) filter (where k.poang = 180)::int          as t180,
       bool_or(l.vinnare = k.sida and not l.mfd)           as vunnet_med_pilar
from public.kast k
join public.leg l on l.mid = k.mid and l.nr = k.leg_nr
group by k.mid, k.leg_nr, k.sida;
create unique index on intern.leg_kast (mid, leg_nr, sida);
grant select on intern.leg_kast to authenticated;
revoke all on intern.leg_kast from anon;

create or replace function public.uppdatera_statistik() returns void
  language plpgsql security definer set search_path = ''
  as $$
begin
  refresh materialized view concurrently intern.match_kast;
  refresh materialized view concurrently intern.leg_kast;
end $$;
revoke execute on function public.uppdatera_statistik() from public, anon, authenticated;
grant execute on function public.uppdatera_statistik() to service_role;

-- En rad per leg och spelare i klubbens turneringar: pilar, snitt, utgång, 180, vunnet med pilar
create or replace view public.v_rekord_leg with (security_invoker = true) as
select lk.mid, m.tdid, t.datum, t.serie, t.omgang, lk.leg_nr, lk.sida,
       ms.namn, d.spelare_id, mo.namn as mot_namn, dm.spelare_id as mot_spelare_id,
       lk.start, lk.pilar, lk.poang, round(3.0 * lk.poang / nullif(lk.pilar, 0), 2) as snitt,
       lk.vunnet_med_pilar, lk.utgang, lk.t180
from intern.leg_kast lk
join public.match m on m.mid = lk.mid
join public.turnering t on t.tdid = m.tdid
join public.match_spelare ms on ms.mid = lk.mid and ms.sida = lk.sida
left join public.match_spelare mo on mo.mid = lk.mid and mo.sida = 1 - lk.sida
left join public.v_deltagare d  on d.tdid = m.tdid and d.tpid = ms.tpid
left join public.v_deltagare dm on dm.tdid = m.tdid and dm.tpid = mo.tpid;
revoke insert, update, delete, truncate, references, trigger on public.v_rekord_leg from authenticated;
revoke all on public.v_rekord_leg from anon;
