-- 03: Schemalagd hämtning tor och sön 23:00 svensk tid (2026-10-31)
--
-- Edge Function "hamta" anropas av pg_cron via pg_net med en hemlig nyckel som bara finns i Vault
-- (skapas här i databasen, syns aldrig i repot eller chatten). Appens knapp "Hämta nu" använder
-- i stället admins inloggning. pg_cron går i UTC: jobbet körs 21:00 och 22:00 UTC och funktionen
-- nedan släpper bara igenom körningen som är 23:00 i Sverige (vinter- och sommartid).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'hamta_nyckel',
  'Nyckel som pg_cron skickar till Edge Function hamta');

-- Används av Edge Function (service role) för att kontrollera nyckeln
create or replace function public.hamtnyckel_ok(nyckel text) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from vault.decrypted_secrets where name = 'hamta_nyckel' and decrypted_secret = nyckel) $$;
revoke execute on function public.hamtnyckel_ok(text) from public, anon, authenticated;
grant execute on function public.hamtnyckel_ok(text) to service_role;

-- Startar hämtningen; kalla = 'schema' (från pg_cron) eller 'manuell' (Claude/SQL Editor, alltid)
create or replace function public.starta_hamtning(kalla text default 'schema') returns bigint
  language plpgsql security definer set search_path = ''
  as $$
begin
  if kalla = 'schema' and extract(hour from now() at time zone 'Europe/Stockholm') <> 23 then
    return null;
  end if;
  return net.http_post(
    url := 'https://xkfjbrkrtetkbjugresq.supabase.co/functions/v1/hamta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hamta-nyckel', (select decrypted_secret from vault.decrypted_secrets where name = 'hamta_nyckel')),
    body := jsonb_build_object('kalla', kalla),
    timeout_milliseconds := 150000);
end $$;
revoke execute on function public.starta_hamtning(text) from public, anon, authenticated;

select cron.schedule('hamta-tor-son', '0 21,22 * * 0,4', $$select public.starta_hamtning('schema')$$);
