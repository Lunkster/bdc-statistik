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
- **Källa:** n01:s API, bara turneringar med *Bankeryd Dart Club* i titeln. Importen skriver med service role; rådata sparas i `data` (jsonb).
- **Spelaridentitet:** n01 har inget spelar-ID mellan turneringar. `alias` kopplar ett n01-namn (skiftlägesokänsligt) till en `spelare` – allmänt (`tdid` tom) eller bara i en turnering (`tdid` satt, går före det allmänna).
- **match_spelare** har ingen främmande nyckel till `deltagare` – n01 kan ha matcher med namn utanför anmälningslistan.
- **kast:** en rad per runda i 01-legs; startraden sparas inte. Vid utgång är `poang` det som var kvar och `pilar` 1–3. Cricket finns bara i rådata.
- **Behörighet:** roll i `app_metadata.roll`. `medlem` och `admin` läser allt; bara `admin` skriver `spelare` och `alias`. Anonyma har ingen åtkomst.

## Vyer
| Vy | Innehåll |
| --- | --- |
| `v_deltagare` | Deltagare med kopplad `spelare_id` (turneringsspecifikt alias före allmänt) |
