-- 01: Grundschema för Bankeryd Dart Clubs statistik (2026-10-31)
--
-- Supabase-projektet bdc-statistik (eget klubbkonto). Data hämtas från n01darts.com:s API
-- (turneringar med "Bankeryd Dart Club" i titeln) av importfunktionen, som skriver med service role.
-- Allt kräver inloggning. Två roller i app_metadata.roll: 'medlem' (läser) och 'admin' (läser,
-- kopplar namn till spelare, startar hämtning). Ingen anonym läsning.
-- Rådata från n01 sparas som jsonb (kolumnen data) så att allt kan tolkas om utan ny hämtning.
-- Härledda värden (snitt, 180:or, placeringar …) lagras inte – de räknas i vyer.

-- Roller ur inloggningens JWT
create or replace function public.roll() returns text
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'roll', '') $$;
create or replace function public.ar_medlem() returns boolean
  language sql stable set search_path = ''
  as $$ select public.roll() in ('medlem', 'admin') $$;
create or replace function public.ar_admin() returns boolean
  language sql stable set search_path = ''
  as $$ select public.roll() = 'admin' $$;

-- Turnering = en tävling på n01 (tdid)
create table public.turnering (
  tdid            text primary key,                 -- n01:s turnerings-ID, t.ex. t_nRTA_1280
  titel           text not null,
  datum           date,                             -- ur t_date, svensk tid
  starttid        timestamptz,                      -- t_date
  serie           text,                             -- tolkad ur titeln: Torsdagscup, Söndagscup, BDC Cup …
  omgang          smallint,                         -- tolkad ur titeln (omg 4, V.4), null om okänd
  status          smallint not null,                -- n01: 10 förbereds … 40 avslutad
  startpoang      smallint,                         -- 501, 301 …
  n01_uppdaterad  bigint,                           -- n01 updateTime (ms) – avgör om den ska hämtas om
  hamtad          timestamptz not null default now(),
  data            jsonb not null                    -- hela tournament/get (utan entry_list)
);

-- Deltagare = en anmälan i en turnering (tpid gäller bara inom turneringen)
create table public.deltagare (
  tdid     text not null references public.turnering on delete cascade,
  tpid     text not null,
  namn     text not null,                           -- som det skrevs i n01
  ordning  smallint,
  primary key (tdid, tpid)
);

-- Match = ett set på n01 (mid). Matcher med flera set hålls ihop av scid.
create table public.match (
  mid             text primary key,
  tdid            text not null references public.turnering on delete cascade,
  tmid            text,                             -- fixtur: <tdid>_<ttype>_<rond>_<tpid>_<tpid>
  scid            text,
  ttype           text,                             -- rr gruppspel, t utslagning, t3 bronsmatch …
  rond            smallint,                         -- 0-baserad
  t_no            smallint,
  match_type      text not null default '01',       -- '01' eller 'cricket'
  startpoang      smallint,
  legs_for_vinst  smallint,                         -- limitLeg
  starttid        timestamptz,
  klar            boolean not null default false,
  n01_uppdaterad  bigint,
  data            jsonb not null                    -- hela match/get
);
create index on public.match (tdid);

-- De två sidorna i en match (0 = vänster, 1 = höger)
create table public.match_spelare (
  mid     text not null references public.match on delete cascade,
  sida    smallint not null check (sida in (0, 1)),
  tdid    text not null,
  tpid    text,
  namn    text not null,
  legs    smallint not null default 0,              -- vunna legs i setet
  poang   integer not null default 0,               -- allScore (01)
  pilar   integer not null default 0,               -- allDarts
  primary key (mid, sida)                          -- ingen främmande nyckel till deltagare: n01 kan ha matcher med namn utanför anmälningslistan
);
create index on public.match_spelare (tdid, tpid);

create table public.leg (
  mid        text not null references public.match on delete cascade,
  nr         smallint not null,                     -- 0-baserad
  forst      smallint,                              -- vem som började (0/1)
  vinnare    smallint,                              -- 0/1, null om inte avgjord
  mfd        boolean not null default false,        -- avgjord med middle for diddle (räknas inte i statistik)
  starttid   timestamptz,
  primary key (mid, nr)
);

-- Kast = en runda (tre pilar) i ett 01-leg. Startraden (score 0, left = startpoäng) sparas inte.
create table public.kast (
  mid      text not null,
  leg_nr   smallint not null,
  sida     smallint not null check (sida in (0, 1)),
  runda    smallint not null,                       -- 1-baserad
  poang    smallint not null,                       -- poäng i rundan (vid utgång = det som var kvar)
  kvar     smallint not null,                       -- kvar efter rundan
  pilar    smallint not null default 3,             -- 1–3 vid utgång, annars 3
  utgang   boolean not null default false,
  primary key (mid, leg_nr, sida, runda),
  foreign key (mid, leg_nr) references public.leg on delete cascade
);

-- n01:s egen turneringsstatistik, oförändrad (typ = kind: stats_list, player_high_out, player_best_leg)
create table public.turnering_statistik (
  tdid  text not null references public.turnering on delete cascade,
  typ   text not null,
  data  jsonb not null,
  primary key (tdid, typ)
);

-- Spelarregistret: en rad per person
create table public.spelare (
  id             integer generated always as identity primary key,
  namn           text not null,                     -- fullständigt namn
  visningsnamn   text,                              -- kortare namn i listor, t.ex. "Oskar B"
  medlemsnummer  text unique,                       -- unik nyckel när klubben har den (kompletteras senare)
  aktiv          boolean not null default true,
  kommentar      text,
  skapad         timestamptz not null default now()
);

-- Alias: n01-namn → spelare. tdid null = gäller i alla turneringar; tdid satt = bara i den turneringen
-- (för tvetydiga namn, t.ex. två olika "Oskar"). Turneringsspecifikt alias går före det allmänna.
create table public.alias (
  id          integer generated always as identity primary key,
  n01_namn    text not null,
  tdid        text references public.turnering on delete cascade,
  spelare_id  integer not null references public.spelare on delete cascade,
  skapad      timestamptz not null default now()
);
create unique index alias_unik on public.alias (lower(btrim(n01_namn)), tdid) nulls not distinct;
create index on public.alias (spelare_id);

-- Hämtlogg: varje körning av importen
create table public.hamtning (
  id               integer generated always as identity primary key,
  start            timestamptz not null default now(),
  slut             timestamptz,
  kalla            text not null check (kalla in ('schema', 'knapp', 'manuell')),
  status           text not null default 'pågår' check (status in ('pågår', 'klar', 'fel')),
  nya_turneringar  integer not null default 0,
  nya_matcher      integer not null default 0,
  meddelande       text
);

-- Deltagare med kopplad spelare (turneringsspecifikt alias före allmänt)
create view public.v_deltagare with (security_invoker = true) as
select d.tdid, d.tpid, d.namn, d.ordning,
       coalesce(at.spelare_id, aa.spelare_id) as spelare_id
from public.deltagare d
left join public.alias at on at.tdid = d.tdid and lower(btrim(at.n01_namn)) = lower(btrim(d.namn))
left join public.alias aa on aa.tdid is null and lower(btrim(aa.n01_namn)) = lower(btrim(d.namn));

-- Row Level Security: medlem och admin läser allt; admin skriver register och alias.
-- Importen skriver med service role (förbi RLS).
alter table public.turnering           enable row level security;
alter table public.deltagare           enable row level security;
alter table public.match               enable row level security;
alter table public.match_spelare       enable row level security;
alter table public.leg                 enable row level security;
alter table public.kast                enable row level security;
alter table public.turnering_statistik enable row level security;
alter table public.spelare             enable row level security;
alter table public.alias               enable row level security;
alter table public.hamtning            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['turnering','deltagare','match','match_spelare','leg','kast','turnering_statistik','spelare','alias','hamtning'] loop
    execute format('create policy "medlem läser" on public.%I for select to authenticated using ((select public.ar_medlem()))', t);
  end loop;
  foreach t in array array['spelare','alias'] loop
    execute format('create policy "admin skriver" on public.%I for insert to authenticated with check ((select public.ar_admin()))', t);
    execute format('create policy "admin ändrar" on public.%I for update to authenticated using ((select public.ar_admin())) with check ((select public.ar_admin()))', t);
    execute format('create policy "admin raderar" on public.%I for delete to authenticated using ((select public.ar_admin()))', t);
  end loop;
end $$;

-- Ingen åtkomst för anonyma
revoke all on all tables in schema public from anon;
