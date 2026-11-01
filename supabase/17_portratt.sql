-- 17: Porträttbilder för spelare (v0.7.0, 2026-11-01)
-- Beslut Henrik 2026-11-01: alla inloggade (medlem och admin) får lägga upp och byta bild.
-- Bilderna ligger i den privata bucketen "portratt" (bara inloggade läser, via signerade länkar),
-- som <spelare_id>.jpg, kvadratiska 256×256 och förminskade i webbläsaren före uppladdning.
-- spelare.bild = filnamnet med versionsstämpel (så att en ny bild inte fastnar i cache), null = ingen bild.
-- Medlemmar får inte ändra spelarregistret i övrigt – bara bilden, via funktionen satt_bild.

alter table public.spelare add column bild text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portratt', 'portratt', false, 1048576, array['image/jpeg']);

create policy "medlem läser porträtt" on storage.objects for select to authenticated
  using (bucket_id = 'portratt' and (select public.ar_medlem()));
create policy "medlem laddar upp porträtt" on storage.objects for insert to authenticated
  with check (bucket_id = 'portratt' and (select public.ar_medlem()) and name ~ '^[0-9]+\.jpg$');
create policy "medlem byter porträtt" on storage.objects for update to authenticated
  using (bucket_id = 'portratt' and (select public.ar_medlem()))
  with check (bucket_id = 'portratt' and (select public.ar_medlem()) and name ~ '^[0-9]+\.jpg$');
create policy "medlem tar bort porträtt" on storage.objects for delete to authenticated
  using (bucket_id = 'portratt' and (select public.ar_medlem()));

-- Sätter eller tar bort bilden för en spelare (bild = '<id>.jpg?v=<tid>' eller null)
create or replace function public.satt_bild(sid integer, bild text) returns void
  language plpgsql security definer set search_path = ''
  as $$
begin
  if not public.ar_medlem() then raise exception 'inte inloggad'; end if;
  if bild is not null and bild !~ ('^' || sid || '\.jpg\?v=[0-9]+$') then raise exception 'ogiltigt filnamn'; end if;
  update public.spelare set bild = satt_bild.bild where id = sid;
end $$;
revoke execute on function public.satt_bild(integer, text) from public, anon;
grant execute on function public.satt_bild(integer, text) to authenticated;
