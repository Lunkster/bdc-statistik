-- 05: Vyerna är skrivskyddade för inloggade (2026-10-31)
revoke insert, update, delete, truncate, references, trigger on public.v_deltagare, public.v_turnering, public.v_turnering_statistik, public.v_match from authenticated;
