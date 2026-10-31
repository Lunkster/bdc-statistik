# Datamodell – bdc-statistik

Supabase-projektet `bdc-statistik`, schemat `public`. Original här i repot; kopia i Obsidian (`Dart-klubbdatabas - Datamodell`).

```mermaid
erDiagram
  turnering ||--o{ deltagare : "anmälda"
  turnering ||--o{ match : "spelade"
  turnering ||--o{ turnering_statistik : "n01:s statistik"
  match ||--|{ match_spelare : "två sidor"
  match ||--o{ leg : ""
  leg ||--o{ kast : "rundor"
  spelare ||--o{ alias : "kallas i n01"
  turnering |o--o{ alias : "bara i turneringen"
  deltagare }o..o| alias : "namn matchas"

  turnering {
    text tdid PK
    text titel
    date datum
    text serie
    smallint omgang
    smallint status
    smallint startpoang
    bigint n01_uppdaterad
    jsonb data
  }
  deltagare {
    text tdid PK
    text tpid PK
    text namn
    smallint ordning
  }
  match {
    text mid PK
    text tdid FK
    text tmid
    text ttype
    smallint rond
    text match_type
    smallint legs_for_vinst
    boolean klar
    jsonb data
  }
  match_spelare {
    text mid PK
    smallint sida PK
    text tpid
    text namn
    smallint legs
    integer poang
    integer pilar
  }
  leg {
    text mid PK
    smallint nr PK
    smallint forst
    smallint vinnare
    boolean mfd
  }
  kast {
    text mid PK
    smallint leg_nr PK
    smallint sida PK
    smallint runda PK
    smallint poang
    smallint kvar
    smallint pilar
    boolean utgang
  }
  turnering_statistik {
    text tdid PK
    text typ PK
    jsonb data
  }
  spelare {
    integer id PK
    text namn
    text visningsnamn
    text medlemsnummer UK
    boolean aktiv
  }
  alias {
    integer id PK
    text n01_namn
    text tdid FK
    integer spelare_id FK
  }
  hamtning {
    integer id PK
    timestamptz start
    text kalla
    text status
    integer nya_turneringar
    integer nya_matcher
  }
```

## Regler
- **Källa:** n01:s API, alla turneringar med *Bankeryd* i titeln. Importen skriver med service role; rådata sparas i `data` (jsonb).
- **Spelaridentitet:** n01 har inget spelar-ID mellan turneringar. `alias` kopplar ett n01-namn (skiftlägesokänsligt) till en `spelare` – allmänt (`tdid` tom) eller bara i en turnering (`tdid` satt, går före det allmänna).
- **match_spelare** har ingen främmande nyckel till `deltagare` – n01 kan ha matcher med namn utanför anmälningslistan.
- **kast:** en rad per runda i 01-legs; startraden sparas inte. Vid utgång är `poang` det som var kvar och `pilar` 1–3. Cricket finns bara i rådata.
- **Middle for diddle:** legs avgjorda med närmast bull (`leg.mfd`, vanligt när rundtaket nås) **räknas med** i poäng och pilar – så gör n01 i både matchdata och turneringsstatistik (kontrollerat 2026-10-31: 4 245 av 4 246 matchsidor stämmer mot `allScore`/`allDarts`, 967 av 968 deltagare mot n01:s `stats_list`).
- **Bästa leg och pilar per leg** räknar bara legs vunna med pilar; n01 räknar även legs avgjorda med middle for diddle (+1 pil). 100+/140+/170+/180 och högsta utgång stämmer exakt med n01 (kontrollerat 2026-10-31, 967 av 967).
- **Handikapp:** en sida kan starta på annan poäng än matchens `startpoang` (t.ex. 401 mot 301) – första raden i n01:s `playerData` visar startpoängen.
- **Hämtning:** Edge Function `hamta` (`supabase/functions/hamta`) – se `03_hamtning_schema.sql` för schemat (pg_cron tor och sön 23:00 svensk tid) och nyckeln i Vault.
- **Spelare:** `fornamn` + `efternamn`; `namn` sätts av en trigger när någon av dem finns. `medlemsnummer` unikt, tomt = null.
- **Ändringslogg:** `alias_logg` fylls av en trigger vid varje ny, flyttad eller borttagen koppling, och av `sla_ihop_spelare(fran, till)` (bara admin) som flyttar alla kopplingar och tar bort den ena spelaren.
- **Cuper:** `tavling` (namn, typ klubbcup/distriktsserie, serie, från, till, kvalgräns, poängregler i `regler` jsonb), `tavling_val` (undantag per turnering: final, omgang, utesluten), `poang_manuell` (bull-utgångar). Placering 1 = finalvinst, 2 = finalförlust, 3 = semifinalplats (n01:s rank).
- **Behörighet:** roll i `app_metadata.roll`. `medlem` och `admin` läser allt; bara `admin` skriver `spelare` och `alias`. Anonyma har ingen åtkomst.

## Vyer
| Vy | Innehåll |
| --- | --- |
| `v_deltagare` | Deltagare med kopplad `spelare_id` (turneringsspecifikt alias före allmänt) |
| `v_turnering_statistik` | n01:s statistik per spelare och turnering ur `stats_list`: placering, matcher, legs, snitt, first 9, 100+/140+/170+/180, high out, bästa/sämsta leg |
| `v_turnering` | Turneringslistan: serie, omgång, antal deltagare och matcher, vinnare, länk till n01 |
| `v_match` | En rad per match med båda sidorna: legs, snitt, kopplad spelare || `v_spelare_match` | En rad per match och spelare: motståndare, legs, snitt, first 9, pilar per vunnet leg, bästa leg, högsta runda och utgång, 100+/140+/170+/180 – spelarsidans grafer, rekord och matchsidan |
| `v_namn_underlag` | Ett n01-namn per turnering: datum, serie, snitt, placering, koppling per turnering och allmänt – adminsidans underlag för att koppla namn |
| `v_tavling_turnering` | En cups turneringar: regeln (serie + datum) plus tillagda, minus uteslutna; roll omgång eller final |
| `v_cup_rad` | Per cup, omgång och deltagare: placering, vunna matcher, 180, 171, hög utgång (≥ cupens gräns), kortset (≤ cupens pilar) |
| `v_cup_poang` | Poängtabellen per cup och person med cupens poängregler, inklusive inmatade bull-utgångar |
| `intern.match_kast` | Materialiserad vy (schemat `intern`, inte i API:et): rundorna summerade per match och sida. Räknas om av `public.uppdatera_statistik()` när hämtningen fått nya matcher |

Vyerna har `security_invoker = true` (följer tabellernas RLS) och är skrivskyddade.
