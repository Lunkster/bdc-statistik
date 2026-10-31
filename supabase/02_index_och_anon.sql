-- 02: Index för alias.tdid och inga rättigheter för anon på framtida tabeller (2026-10-31)
create index on public.alias (tdid);
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
