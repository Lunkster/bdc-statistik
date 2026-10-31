-- 14: Att göra / kvalitetssäkra – uppgifter för tävlingsledaren och administratören (2026-10-31)
-- Bara admin läser och skriver. Uppgifterna själva matas in i appen (Admin → Att göra) – inga personuppgifter i repot.
create table public.uppgift (
  id           integer generated always as identity primary key,
  titel        text not null,
  beskrivning  text,
  ansvar       text not null check (ansvar in ('tävlingsledare', 'administratör')),
  kategori     text,
  lank         text,
  status       text not null default 'öppen' check (status in ('öppen', 'klar')),
  klar_tid     timestamptz,
  kommentar    text,
  ordning      integer not null default 100,
  skapad       timestamptz not null default now()
);
alter table public.uppgift enable row level security;
create policy "admin läser" on public.uppgift for select to authenticated using ((select public.ar_admin()));
create policy "admin skriver" on public.uppgift for insert to authenticated with check ((select public.ar_admin()));
create policy "admin ändrar" on public.uppgift for update to authenticated using ((select public.ar_admin())) with check ((select public.ar_admin()));
create policy "admin raderar" on public.uppgift for delete to authenticated using ((select public.ar_admin()));
