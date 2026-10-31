-- 08: Statistik per spelare och match, ur rundorna (2026-10-31)
-- En rad per match och sida. Grund för spelarsidans grafer, rekord och matchsidan.
-- Legs avgjorda med middle for diddle räknas med i poäng och pilar (som n01), men inte i
-- "pilar per vunnet leg" och "bästa leg" (de avgjordes inte med pilar).

create or replace view public.v_spelare_match with (security_invoker = true) as
with legstat as (
  select k.mid, k.sida, k.leg_nr,
         sum(k.pilar)                                         as pilar,
         sum(k.poang) filter (where k.runda <= 3)             as f9_poang,
         sum(k.pilar) filter (where k.runda <= 3)             as f9_pilar,
         max(k.poang)                                         as hogsta_runda,
         max(k.poang) filter (where k.utgang)                 as utgang,
         count(*) filter (where k.poang = 180)                as t180,
         count(*) filter (where k.poang >= 140 and k.poang < 180) as t140,
         count(*) filter (where k.poang >= 100 and k.poang < 140) as t100,
         bool_or(l.vinnare = k.sida and not l.mfd)             as vunnet_med_pilar
  from public.kast k
  join public.leg l on l.mid = k.mid and l.nr = k.leg_nr
  group by k.mid, k.sida, k.leg_nr
),
per_match as (
  select mid, sida,
         sum(f9_poang) as f9_poang, sum(f9_pilar) as f9_pilar,
         max(hogsta_runda) as hogsta_runda, max(utgang) as hogsta_utgang,
         sum(t180) as t180, sum(t140) as t140, sum(t100) as t100,
         count(*) filter (where vunnet_med_pilar)                as legs_vunna_pilar,
         sum(pilar) filter (where vunnet_med_pilar)              as pilar_vunna_legs,
         min(pilar) filter (where vunnet_med_pilar)              as basta_leg
  from legstat group by mid, sida
)
select m.mid, m.tdid, t.datum, m.starttid, m.ttype, m.rond,
       ms.sida, ms.tpid, ms.namn, d.spelare_id,
       mo.namn as mot_namn, dm.spelare_id as mot_spelare_id,
       ms.legs as legs_vunna, mo.legs as legs_forlorade, (ms.legs > mo.legs) as vann,
       ms.poang, ms.pilar,
       round(3.0 * ms.poang / nullif(ms.pilar, 0), 2)                    as snitt,
       round(3.0 * p.f9_poang / nullif(p.f9_pilar, 0), 2)                as snitt_f9,
       p.legs_vunna_pilar,
       round(p.pilar_vunna_legs::numeric / nullif(p.legs_vunna_pilar, 0), 1) as pilar_per_leg,
       p.basta_leg, p.hogsta_runda, p.hogsta_utgang, p.t180, p.t140, p.t100
from public.match m
join public.turnering t on t.tdid = m.tdid
join public.match_spelare ms on ms.mid = m.mid
left join public.match_spelare mo on mo.mid = m.mid and mo.sida = 1 - ms.sida
left join public.v_deltagare d  on d.tdid = m.tdid and d.tpid = ms.tpid
left join public.v_deltagare dm on dm.tdid = m.tdid and dm.tpid = mo.tpid
left join per_match p on p.mid = m.mid and p.sida = ms.sida
where ms.pilar > 0;

revoke insert, update, delete, truncate, references, trigger on public.v_spelare_match from authenticated;
