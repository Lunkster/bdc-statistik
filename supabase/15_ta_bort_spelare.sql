-- 15: Ta bort tomma spelare från Spelarregistret (v0.5, 2026-10-31)
-- Bara admin, bara inaktiva spelare utan kopplade n01-namn och utan inmatade poäng – inga resultat kan försvinna.
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
  delete from public.spelare where id = sid;
  insert into public.alias_logg (handling, n01_namn, fran_spelare) values ('spelare borttagen', s.namn, sid);
end $$;
revoke execute on function public.ta_bort_spelare(integer) from public, anon;
grant execute on function public.ta_bort_spelare(integer) to authenticated;
