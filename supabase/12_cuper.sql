-- 12: Cuper/säsonger och poängtabeller (2026-10-31)
-- En tävling (cup) samlar turneringar enligt en regel: serie + datumintervall. Nya omgångar hamnar
-- därför automatiskt i rätt cup. Admin kan markera en turnering som final, utesluta den eller lägga
-- till en som inte följer regeln (tavling_val). Poängreglerna ligger per cup i regler (jsonb).
-- typ 'distriktsserie' förbereds för v0.5 (n01_lgid).

create table public.tavling (
  id          integer generated always as identity primary key,
  namn        text not null,
  typ         text not null default 'klubbcup' check (typ in ('klubbcup', 'distriktsserie')),
  serie       text,                         -- matchas mot turnering.serie
  fran        date,
  till        date,
  n01_lgid    text,                         -- distriktsserie: n01-ligans id
  kvalgrans   integer,                      -- poäng som krävs till finalspelet
  regler      jsonb not null default '{"deltagande":5,"finalvinst":5,"finalforlust":3,"semifinal":2,"vunnen_match":1,"hog_utgang":1,"hog_utgang_fran":100,"t180":1,"t171":0,"kortset":0,"kortset_pilar":21,"bull":1}',
  aktiv       boolean not null default true,
  kommentar   text,
  skapad      timestamptz not null default now()
);

-- Undantag från regeln: roll final, omgang (läggs till) eller utesluten
create table public.tavling_val (
  tavling_id  integer not null references public.tavling on delete cascade,
  tdid        text not null references public.turnering on delete cascade,
  roll        text not null check (roll in ('omgang', 'final', 'utesluten')),
  primary key (tavling_id, tdid)
);
create index on public.tavling_val (tdid);

-- Poäng som inte går att räkna ur n01 (t.ex. bull-utgång), matas in av admin
create table public.poang_manuell (
  id          integer generated always as identity primary key,
  tavling_id  integer not null references public.tavling on delete cascade,
  spelare_id  integer references public.spelare on delete cascade,
  n01_namn    text,                         -- om spelaren inte är kopplad
  kategori    text not null default 'bull' check (kategori in ('bull')),
  antal       integer not null default 1,
  kommentar   text,
  check (spelare_id is not null or n01_namn is not null)
);
create index on public.poang_manuell (tavling_id);
create index on public.poang_manuell (spelare_id);

alter table public.tavling       enable row level security;
alter table public.tavling_val   enable row level security;
alter table public.poang_manuell enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tavling','tavling_val','poang_manuell'] loop
    execute format('create policy "medlem läser" on public.%I for select to authenticated using ((select public.ar_medlem()))', t);
    execute format('create policy "admin skriver" on public.%I for insert to authenticated with check ((select public.ar_admin()))', t);
    execute format('create policy "admin ändrar" on public.%I for update to authenticated using ((select public.ar_admin())) with check ((select public.ar_admin()))', t);
    execute format('create policy "admin raderar" on public.%I for delete to authenticated using ((select public.ar_admin()))', t);
  end loop;
end $$;

-- Cupens turneringar: regeln (serie + datum) plus tillagda, minus uteslutna; roll omgang eller final
create or replace view public.v_tavling_turnering with (security_invoker = true) as
select x.tavling_id, x.tdid, x.roll, tu.datum, tu.serie, tu.omgang, tu.titel
from (
  select t.id as tavling_id, tu.tdid, coalesce(v.roll, 'omgang') as roll
  from public.tavling t
  join public.turnering tu on tu.serie = t.serie and tu.datum between coalesce(t.fran, '-infinity') and coalesce(t.till, 'infinity')
  left join public.tavling_val v on v.tavling_id = t.id and v.tdid = tu.tdid
  union
  select v.tavling_id, v.tdid, v.roll from public.tavling_val v where v.roll in ('omgang', 'final')
) x
join public.turnering tu on tu.tdid = x.tdid
where x.roll <> 'utesluten';

-- En rad per cup, omgång och deltagare med det som ger poäng
create or replace view public.v_cup_rad with (security_invoker = true) as
with tt as (
  select vt.tavling_id, vt.tdid, coalesce((t.regler ->> 'hog_utgang_fran')::int, 100) as ho_fran,
         coalesce((t.regler ->> 'kortset_pilar')::int, 21) as ks_pilar
  from public.v_tavling_turnering vt join public.tavling t on t.id = vt.tavling_id
  where vt.roll = 'omgang'
),
kast_sida as (
  select tt.tavling_id, ms.tdid, ms.tpid,
         count(*) filter (where k.utgang and k.poang >= tt.ho_fran) as hog_utgang,
         count(*) filter (where k.poang = 171)                     as t171
  from tt
  join public.match_spelare ms on ms.tdid = tt.tdid
  join public.kast k on k.mid = ms.mid and k.sida = ms.sida
  group by 1, 2, 3
),
legs as (
  select tt.tavling_id, ms.tdid, ms.tpid, count(*) as kortset
  from tt
  join public.match_spelare ms on ms.tdid = tt.tdid
  join public.leg l on l.mid = ms.mid and l.vinnare = ms.sida and not l.mfd
  where (select sum(k.pilar) from public.kast k where k.mid = l.mid and k.leg_nr = l.nr and k.sida = ms.sida) <= tt.ks_pilar
  group by 1, 2, 3
)
select tt.tavling_id, s.tdid, s.tpid, s.namn, s.spelare_id, s.placering,
       coalesce(s.vunna_matcher, 0) as vunna_matcher, coalesce(s.t180, 0) as t180,
       coalesce(k.hog_utgang, 0) as hog_utgang, coalesce(k.t171, 0) as t171, coalesce(l.kortset, 0) as kortset
from tt
join public.v_turnering_statistik s on s.tdid = tt.tdid
left join kast_sida k on k.tavling_id = tt.tavling_id and k.tdid = s.tdid and k.tpid = s.tpid
left join legs l on l.tavling_id = tt.tavling_id and l.tdid = s.tdid and l.tpid = s.tpid;

-- Poängtabellen: en rad per cup och person (eller okopplat n01-namn)
create or replace view public.v_cup_poang with (security_invoker = true) as
with per as (
  select r.tavling_id, r.spelare_id, case when r.spelare_id is null then lower(btrim(r.namn)) end as namn_nyckel,
         min(r.namn) as n01_namn,
         count(*)                                   as deltagande,
         count(*) filter (where r.placering = 1)    as finalvinst,
         count(*) filter (where r.placering = 2)    as finalforlust,
         count(*) filter (where r.placering = 3)    as semifinal,
         sum(r.vunna_matcher)::int                  as vunna_matcher,
         sum(r.hog_utgang)::int                     as hog_utgang,
         sum(r.t180)::int                           as t180,
         sum(r.t171)::int                           as t171,
         sum(r.kortset)::int                        as kortset
  from public.v_cup_rad r
  group by 1, 2, 3
),
manuell as (
  select tavling_id, spelare_id, case when spelare_id is null then lower(btrim(n01_namn)) end as namn_nyckel, sum(antal)::int as bull
  from public.poang_manuell where kategori = 'bull' group by 1, 2, 3
)
select p.tavling_id, p.spelare_id, p.n01_namn, s.namn as spelare_namn, coalesce(s.visningsnamn, s.namn, p.n01_namn) as visas,
       p.deltagande, p.finalvinst, p.finalforlust, p.semifinal, p.vunna_matcher, p.hog_utgang, p.t180, p.t171, p.kortset,
       coalesce(m.bull, 0) as bull,
       ( p.deltagande    * coalesce((t.regler ->> 'deltagande')::int, 0)
       + p.finalvinst    * coalesce((t.regler ->> 'finalvinst')::int, 0)
       + p.finalforlust  * coalesce((t.regler ->> 'finalforlust')::int, 0)
       + p.semifinal     * coalesce((t.regler ->> 'semifinal')::int, 0)
       + p.vunna_matcher * coalesce((t.regler ->> 'vunnen_match')::int, 0)
       + p.hog_utgang    * coalesce((t.regler ->> 'hog_utgang')::int, 0)
       + p.t180          * coalesce((t.regler ->> 't180')::int, 0)
       + p.t171          * coalesce((t.regler ->> 't171')::int, 0)
       + p.kortset       * coalesce((t.regler ->> 'kortset')::int, 0)
       + coalesce(m.bull, 0) * coalesce((t.regler ->> 'bull')::int, 0) ) as summa,
       t.kvalgrans
from per p
join public.tavling t on t.id = p.tavling_id
left join public.spelare s on s.id = p.spelare_id
left join manuell m on m.tavling_id = p.tavling_id and m.spelare_id is not distinct from p.spelare_id and m.namn_nyckel is not distinct from p.namn_nyckel;

revoke insert, update, delete, truncate, references, trigger on public.v_tavling_turnering, public.v_cup_rad, public.v_cup_poang from authenticated;
