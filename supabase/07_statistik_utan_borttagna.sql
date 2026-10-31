-- 07: n01:s statistik bara för deltagare som finns i anmälningslistan (2026-10-31)
-- En borttagen anmälan kan ligga kvar i n01:s stats_list utan namn och utan matcher – den ska inte visas
-- (gav felet "a.namn is null" på Spelare i v0.1.0).

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
join public.v_deltagare d on d.tdid = s.tdid and d.tpid = e.key
where s.typ = 'stats_list';
revoke insert, update, delete, truncate, references, trigger on public.v_turnering_statistik from authenticated;
