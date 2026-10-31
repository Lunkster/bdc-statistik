-- 16: Distriktsserien (v0.5, 2026-10-31)
-- En n01-liga (t.ex. GDF Distriktserie 26/27, lg_raSv_5956) följs via en tavling med typ 'distriktsserie'
-- och n01_lgid. Varje division är en n01-turnering med lag som deltagare. Beslut Henrik 2026-10-31:
-- hela divisionernas serietabeller och lagmatchresultat tas med, men matcher, legs och spelarstatistik
-- lagras bara för Bankeryds lag. Hålls isär från klubbens cuper (egna tabeller ds_*), så att klubbens
-- statistik, spelarlista och poängtabeller inte påverkas.

-- Division = en turnering i ligan
create table public.ds_division (
  tdid            text primary key,
  tavling_id      integer not null references public.tavling on delete cascade,
  titel           text not null,
  division        text,                             -- ur lg_title/titeln, t.ex. "Div 2B"
  status          smallint not null,                -- 30 pågår, 40 avslutad
  startpoang      smallint,
  n01_uppdaterad  bigint,                           -- sätts när allt är hämtat
  hamtad          timestamptz not null default now(),
  data            jsonb not null,                   -- tournament/get utan entry_list
  tabell          jsonb,                            -- tournament/standings (groups)
  spelarstatistik jsonb                             -- player_stats_list, bara Bankeryds lag (nyckel = oid)
);
create index on public.ds_division (tavling_id);

-- Lagen i divisionen
create table public.ds_lag (
  tdid      text not null references public.ds_division on delete cascade,
  tpid      text not null,
  namn      text not null,
  ordning   smallint,
  bankeryd  boolean not null default false,
  primary key (tdid, tpid)
);

-- Lagmatch = två lag möts (ur lg_result och match/list). vunna = vunna singlar + dubblar
create table public.ds_lagmatch (
  tdid     text not null references public.ds_division on delete cascade,
  nyckel   text not null,                           -- t.ex. 0_xpj5 (grupp_id i tmid)
  lag_a    text not null,                           -- tpid, första laget i n01:s tmid
  lag_b    text not null,
  vunna_a  smallint,
  vunna_b  smallint,
  snitt_a  numeric,
  snitt_b  numeric,
  datum    date,
  primary key (tdid, nyckel)
);

-- Delmatch (singel eller dubbel) i en lagmatch där Bankeryd spelar
create table public.ds_match (
  mid             text primary key,
  tdid            text not null references public.ds_division on delete cascade,
  nyckel          text not null,                    -- lagmatchen
  schid           text,
  nr              smallint,                         -- plats i spelschemat (0-baserad)
  delmatch        text,                             -- "Singel 1 (A-A) (Hemma)", "Dubbel 2 (CD-CD) (Borta)"
  dubbel          boolean not null default false,
  legs_for_vinst  smallint,
  starttid        timestamptz,
  klar            boolean not null default false,
  n01_uppdaterad  bigint,
  data            jsonb not null                    -- hela match/get
);
create index on public.ds_match (tdid, nyckel);

create table public.ds_match_sida (
  mid       text not null references public.ds_match on delete cascade,
  sida      smallint not null check (sida in (0, 1)),
  lag_tpid  text not null,
  legs      smallint not null default 0,
  poang     integer not null default 0,
  pilar     integer not null default 0,
  primary key (mid, sida)
);

-- Lagmedlemmarna som spelade (order i n01): en i singel, två i dubbel. oid gäller hela divisionen
create table public.ds_match_spelare (
  mid    text not null,
  sida   smallint not null,
  plats  smallint not null,
  oid    text,
  namn   text not null,
  primary key (mid, sida, plats),
  foreign key (mid, sida) references public.ds_match_sida on delete cascade
);

create table public.ds_leg (
  mid      text not null references public.ds_match on delete cascade,
  nr       smallint not null,
  forst    smallint,
  vinnare  smallint,
  mfd      boolean not null default false,
  primary key (mid, nr)
);

create table public.ds_kast (
  mid      text not null,
  leg_nr   smallint not null,
  sida     smallint not null check (sida in (0, 1)),
  runda    smallint not null,
  poang    smallint not null,
  kvar     smallint not null,
  pilar    smallint not null default 3,
  utgang   boolean not null default false,
  primary key (mid, leg_nr, sida, runda),
  foreign key (mid, leg_nr) references public.ds_leg on delete cascade
);

-- Koppling lagmedlem (oid i en division) → spelare. Går före fullständigt namn och allmänt alias
create table public.ds_alias (
  tdid        text not null references public.ds_division on delete cascade,
  oid         text not null,
  spelare_id  integer not null references public.spelare on delete cascade,
  skapad      timestamptz not null default now(),
  primary key (tdid, oid)
);
create index on public.ds_alias (spelare_id);

alter table public.ds_division      enable row level security;
alter table public.ds_lag           enable row level security;
alter table public.ds_lagmatch      enable row level security;
alter table public.ds_match         enable row level security;
alter table public.ds_match_sida    enable row level security;
alter table public.ds_match_spelare enable row level security;
alter table public.ds_leg           enable row level security;
alter table public.ds_kast          enable row level security;
alter table public.ds_alias         enable row level security;
do $$
declare t text;
begin
  foreach t in array array['ds_division','ds_lag','ds_lagmatch','ds_match','ds_match_sida','ds_match_spelare','ds_leg','ds_kast','ds_alias'] loop
    execute format('create policy "medlem läser" on public.%I for select to authenticated using ((select public.ar_medlem()))', t);
  end loop;
  execute 'create policy "admin skriver" on public.ds_alias for insert to authenticated with check ((select public.ar_admin()))';
  execute 'create policy "admin ändrar" on public.ds_alias for update to authenticated using ((select public.ar_admin())) with check ((select public.ar_admin()))';
  execute 'create policy "admin raderar" on public.ds_alias for delete to authenticated using ((select public.ar_admin()))';
end $$;
revoke all on public.ds_division, public.ds_lag, public.ds_lagmatch, public.ds_match, public.ds_match_sida,
  public.ds_match_spelare, public.ds_leg, public.ds_kast, public.ds_alias from anon;

-- Serietabellen per division, som n01 räknar den (2 poäng för vinst, 1 oavgjort)
create or replace view public.v_ds_tabell with (security_invoker = true) as
select d.tdid, d.tavling_id, d.division,
       (p ->> 'rank')::int as placering, p ->> 'tpid' as tpid, p ->> 'name' as lag, coalesce(l.bankeryd, false) as bankeryd,
       (p ->> 'p')::int as spelade, (p ->> 'w')::int as vunna, (p ->> 'd')::int as oavgjorda, (p ->> 'l')::int as forlorade,
       (p ->> 'diff')::int as diff, (p ->> 'pts')::int as poang
from public.ds_division d
cross join lateral jsonb_array_elements(coalesce(d.tabell -> 0 -> 'players', '[]'::jsonb)) p
left join public.ds_lag l on l.tdid = d.tdid and l.tpid = p ->> 'tpid';

-- Lagmatcher med lagnamn
create or replace view public.v_ds_lagmatch with (security_invoker = true) as
select m.tdid, d.tavling_id, d.division, m.nyckel, m.datum,
       m.lag_a, la.namn as namn_a, coalesce(la.bankeryd, false) as bankeryd_a, m.vunna_a, m.snitt_a,
       m.lag_b, lb.namn as namn_b, coalesce(lb.bankeryd, false) as bankeryd_b, m.vunna_b, m.snitt_b,
       (select count(*) from public.ds_match x where x.tdid = m.tdid and x.nyckel = m.nyckel) as delmatcher
from public.ds_lagmatch m
join public.ds_division d on d.tdid = m.tdid
left join public.ds_lag la on la.tdid = m.tdid and la.tpid = m.lag_a
left join public.ds_lag lb on lb.tdid = m.tdid and lb.tpid = m.lag_b;

-- Bankeryds lagmedlemmar med n01:s spelarstatistik (singlar och dubblar) och kopplad spelare:
-- ds_alias, annars spelare med samma fullständiga namn (om entydigt), annars allmänt alias.
create or replace view public.v_ds_spelare with (security_invoker = true) as
with st as (
  select d.tdid, d.tavling_id, d.division, e.key as oid, e.value as v
  from public.ds_division d
  cross join lateral jsonb_each(case when jsonb_typeof(d.spelarstatistik) = 'object' then d.spelarstatistik else '{}'::jsonb end) e
),
spel as (
  select m.tdid, p.oid, m.dubbel, s.legs > o.legs as vann
  from public.ds_match m
  join public.ds_match_spelare p on p.mid = m.mid
  join public.ds_match_sida s on s.mid = m.mid and s.sida = p.sida
  join public.ds_match_sida o on o.mid = m.mid and o.sida = 1 - p.sida
  where m.klar
),
per as (
  select tdid, oid,
         count(*) filter (where not dubbel)          as singlar,
         count(*) filter (where not dubbel and vann) as singlar_vunna,
         count(*) filter (where dubbel)              as dubblar,
         count(*) filter (where dubbel and vann)     as dubblar_vunna
  from spel group by 1, 2
)
select st.tdid, st.tavling_id, st.division, st.oid, st.v ->> 'tpid' as lag_tpid, l.namn as lag,
       btrim(st.v ->> 'oname') as namn,
       coalesce(a.spelare_id,
                (select min(s.id) from public.spelare s where lower(btrim(s.namn)) = lower(btrim(st.v ->> 'oname')) having count(*) = 1),
                (select min(x.spelare_id) from public.alias x where x.tdid is null and lower(btrim(x.n01_namn)) = lower(btrim(st.v ->> 'oname')))) as spelare_id,
       a.spelare_id is not null as kopplad_av_admin,
       (st.v ->> 'match')::int   as lagmatcher,
       (st.v ->> 'set')::int     as matcher,
       (st.v ->> 'winSet')::int  as vunna_matcher,
       (st.v ->> 'leg')::int     as legs,
       (st.v ->> 'winLeg')::int  as vunna_legs,
       (st.v ->> 'score')::int   as poang,
       (st.v ->> 'darts')::int   as pilar,
       round(3.0 * (st.v ->> 'score')::numeric / nullif((st.v ->> 'darts')::numeric, 0), 2)     as snitt,
       round(3.0 * (st.v ->> 'f9Score')::numeric / nullif((st.v ->> 'f9Darts')::numeric, 0), 2) as snitt_f9,
       (st.v ->> 'ton00')::int as t100, (st.v ->> 'ton40')::int as t140, (st.v ->> 'ton70')::int as t170, (st.v ->> 'ton80')::int as t180,
       nullif((st.v ->> 'highOut')::int, 0) as high_out,
       nullif((st.v ->> 'best')::int, 0)    as basta_leg,
       coalesce(per.singlar, 0) as singlar, coalesce(per.singlar_vunna, 0) as singlar_vunna,
       coalesce(per.dubblar, 0) as dubblar, coalesce(per.dubblar_vunna, 0) as dubblar_vunna
from st
left join public.ds_lag l on l.tdid = st.tdid and l.tpid = st.v ->> 'tpid'
left join public.ds_alias a on a.tdid = st.tdid and a.oid = st.oid
left join per on per.tdid = st.tdid and per.oid = st.oid;

-- Delmatcher med båda sidorna, lag och spelare på en rad
create or replace view public.v_ds_match with (security_invoker = true) as
select m.mid, m.tdid, m.nyckel, m.nr, m.delmatch, m.dubbel, m.starttid, m.klar, m.legs_for_vinst,
       a.lag_tpid as lag_a, la.namn as namn_a, coalesce(la.bankeryd, false) as bankeryd_a, a.legs as legs_a,
       round(3.0 * a.poang / nullif(a.pilar, 0), 2) as snitt_a,
       (select jsonb_agg(jsonb_build_object('namn', p.namn, 'oid', p.oid, 'spelare_id', vs.spelare_id) order by p.plats)
          from public.ds_match_spelare p left join public.v_ds_spelare vs on vs.tdid = m.tdid and vs.oid = p.oid
         where p.mid = m.mid and p.sida = 0) as spelare_a,
       b.lag_tpid as lag_b, lb.namn as namn_b, coalesce(lb.bankeryd, false) as bankeryd_b, b.legs as legs_b,
       round(3.0 * b.poang / nullif(b.pilar, 0), 2) as snitt_b,
       (select jsonb_agg(jsonb_build_object('namn', p.namn, 'oid', p.oid, 'spelare_id', vs.spelare_id) order by p.plats)
          from public.ds_match_spelare p left join public.v_ds_spelare vs on vs.tdid = m.tdid and vs.oid = p.oid
         where p.mid = m.mid and p.sida = 1) as spelare_b
from public.ds_match m
join public.ds_match_sida a on a.mid = m.mid and a.sida = 0
left join public.ds_match_sida b on b.mid = m.mid and b.sida = 1
left join public.ds_lag la on la.tdid = m.tdid and la.tpid = a.lag_tpid
left join public.ds_lag lb on lb.tdid = m.tdid and lb.tpid = b.lag_tpid;

revoke insert, update, delete, truncate, references, trigger on public.v_ds_tabell, public.v_ds_lagmatch, public.v_ds_spelare, public.v_ds_match from authenticated;
revoke all on public.v_ds_tabell, public.v_ds_lagmatch, public.v_ds_spelare, public.v_ds_match from anon;

-- Ligan att följa
insert into public.tavling (namn, typ, fran, till, n01_lgid, kommentar)
values ('GDF Distriktserie 26/27', 'distriktsserie', '2026-10-17', null, 'lg_raSv_5956',
        'Bankeryd A i Div 2B och Bankeryd B i Div 3A.');
