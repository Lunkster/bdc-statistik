-- 13: Triggerfunktionerna ska inte kunna anropas via API:et (2026-10-31, get_advisors)
-- Triggrar fungerar ändå. sla_ihop_spelare får vara körbar för inloggade – den kontrollerar själv att anroparen är admin.
revoke execute on function public.logga_alias() from public, anon, authenticated;
revoke execute on function public.spelare_namn() from public, anon, authenticated;
