-- 06: Roller för klubbens två konton (2026-10-31)
-- Kontona skapas av Henrik i Supabase: Authentication → Users → Add user → Create new user,
-- lösenordet = koden (sparas i lösenordshanteraren), bocka i Auto Confirm User.
-- Kör sedan raderna nedan (Claude eller SQL Editor).
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"roll":"medlem"}'
  where email = 'lundqvist.henrik+bdc@proton.me';
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"roll":"admin"}'
  where email = 'lundqvist.henrik+bdcadmin@proton.me';
