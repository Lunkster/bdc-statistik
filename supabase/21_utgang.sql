-- 21: Utgång-% per spelare och tävling (2026-11-02)
--
-- Utgångsläge = en runda som började på 2–170, utom de sju tal som inte går att ta ut med tre pilar
-- (159, 162, 163, 165, 166, 168, 169). Utgång-% = utgångar / utgångslägen – exakt, ur rundorna.
-- Legs som avgjorts med närmast bull är inga utgångar men lägena i dem räknas.
-- (Checkout-% per pil uppskattas i appen ur n01:s stats_list, se utgang.js.)

create or replace view public.v_turnering_utgang with (security_invoker = true) as
select ms.tdid, ms.tpid,
       count(*) filter (where k.utgang)                                         as utgangar,
       count(*) filter (where k.kvar + k.poang between 2 and 170
                          and k.kvar + k.poang not in (159, 162, 163, 165, 166, 168, 169)) as utgangslagen
from public.kast k
join public.match_spelare ms on ms.mid = k.mid and ms.sida = k.sida
group by ms.tdid, ms.tpid;

revoke insert, update, delete, truncate, references, trigger on public.v_turnering_utgang from authenticated;
grant select on public.v_turnering_utgang to authenticated;
