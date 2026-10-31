-- 04: Vyer för appen v0.1 (2026-10-31)
-- Allt härlett räknas här. security_invoker = true: vyerna följer tabellernas RLS (bara inloggade medlemmar/admin).

-- Spelare per deltagande, med kopplad person (alias per turnering före allmänt)
-- (v_deltagare finns sedan 01)

-- n01:s turneringsstatistik per spelare, utplockad ur stats_list (samma siffror som n01:s statistiksida)
create or replace view public.v_turnering_statistik with (security_invoker = true) as
select s.tdid, e.key as tpid, d.namn, d.spelare_id,
       nullif((e.value ->> 'rank')::int, 0)          as placering,
       (e.value ->> 'match')::int                    as matcher,
       (e.value ->> 'winMatch')::int                 as vunna_matcher,
       (e.value ->> 'leg')::int                      as legs,
       (e.value ->> 'winLeg')::int                   as vunna_legs,
       (e.value ->> 'score')::int                    as poang,
       (e.value ->> 'darts')::int                    as pilar,
       round(3.0 * (e.value ->> 'score')::numeric / nullif((e.value ->> 'darts')::numeric, 0), 2)     as snitt,
       round(3.0 * (e.value ->> 'f9Score')::numeric / nullif((e.value ->> 'f9Darts')::numeric, 0), 2) as snitt_f9,
       (e.value ->> 'ton00')::int                    as t100,
       (e.value ->> 'ton40')::int                    as t140,
       (e.value ->> 'ton70')::int                    as t170,
       (e.value ->> 'ton80')::int                    as t180,
       nullif((e.value ->> 'highOut')::int, 0)       as high_out,
       nullif((e.value ->> 'best')::int, 0)          as basta_leg,
       nullif((e.value ->> 'worst')::int, 0)         as samsta_leg
from public.turnering_statistik s
cross join lateral jsonb_each(case when jsonb_typeof(s.data) = 'object' then s.data else '{}'::jsonb end) e
left join public.v_deltagare d on d.tdid = s.tdid and d.tpid = e.key
where s.typ = 'stats_list';

-- Turneringslistan
create or replace view public.v_turnering with (security_invoker = true) as
select t.tdid, t.titel, t.datum, t.serie, t.omgang, t.startpoang,
       (select count(*) from public.deltagare d where d.tdid = t.tdid)  as deltagare,
       (select count(*) from public.match m where m.tdid = t.tdid)      as matcher,
       v.namn as vinnare, v.spelare_id as vinnare_id,
       'https://n01darts.com/n01/tournament/comp.php?id=' || t.tdid     as n01_url
from public.turnering t
left join lateral (select s.namn, s.spelare_id from public.v_turnering_statistik s
                   where s.tdid = t.tdid and s.placering = 1 limit 1) v on true;

-- Matcher med båda sidorna på en rad
create or replace view public.v_match with (security_invoker = true) as
select m.mid, m.tdid, m.ttype, m.rond, m.t_no, m.starttid, m.legs_for_vinst, m.klar,
       a.tpid as tpid_a, a.namn as namn_a, da.spelare_id as spelare_a, a.legs as legs_a,
       round(3.0 * a.poang / nullif(a.pilar, 0), 2) as snitt_a,
       b.tpid as tpid_b, b.namn as namn_b, db.spelare_id as spelare_b, b.legs as legs_b,
       round(3.0 * b.poang / nullif(b.pilar, 0), 2) as snitt_b
from public.match m
join public.match_spelare a on a.mid = m.mid and a.sida = 0
left join public.match_spelare b on b.mid = m.mid and b.sida = 1
left join public.v_deltagare da on da.tdid = m.tdid and da.tpid = a.tpid
left join public.v_deltagare db on db.tdid = m.tdid and db.tpid = b.tpid;
