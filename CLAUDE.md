# Instruktioner för Claude – Bankeryd Dart Clubs statistik

- Läs först Obsidian `Projekt/Dart-klubbdatabas/Dart-klubbdatabas - Projektdokument.md` (tågordning, logg), `Dart-klubbdatabas - Krav.md` och `Dart-klubbdatabas - n01-API.md`.
- Följ skillen `obsidian-projekt`: logga i projektdokumentet, temporära filer i `~/Dokument/Claude/Dart-klubbdatabas/`, aldrig i Obsidian.
- Databasen är Supabase-projektet `bdc-statistik` (`xkfjbrkrtetkbjugresq`) i klubbens eget konto (`lundqvist.henrik@proton.me`). Claudes Supabase-koppling måste vara inloggad med det kontot.
- Källa: n01:s API `https://api.n01darts.com/api/v1`, alla turneringar med "Bankeryd" i titeln. Domänen är blockerad i Claudes miljöer – importen körs som Edge Function.
- Roller i `app_metadata.roll`: `medlem` (läser) och `admin` (läser, kopplar namn, startar hämtning). Importen skriver med service role.
- Schemaändringar: ny numrerad fil i `supabase/` + `apply_migration` (namn `bdc_NN_...`). Kör `get_advisors` efteråt. Uppdatera `docs/datamodell.md` och kopian i Obsidian.
- Lagra aldrig härledda värden – lägg logiken i vyerna. Rådata från n01 sparas i `data` (jsonb).
- Format enligt SI: ÅÅÅÅ-MM-DD, 24 h, decimalkomma, `toLocaleString("sv-SE")`.
- Inga personuppgifter, exporter eller nycklar (utom publishable key) i repot – testdatan i `tests/` har påhittade namn.
- Versionsnummer i `index.html` (`?v=`), i importerna och i `#version` ändras vid varje release.
- Testa med `tests/test.mjs` (attrapp, amerikanska inställningar för att fånga fel format) före commit.
- Nyheter: skriv i Obsidian `Dart-klubbdatabas - Nyheter.md` och kör `python3 ~/Dokument/Claude/Dart-klubbdatabas/skript/nyheter.py` → `nyheter.json` (visas under i-knappen). Inga spelarnamn i nyheterna – repot är publikt.
- Databasändringar som tar bort data (delete, drop) går inte via Claudes Supabase-koppling (bekräftelsefrågan når inte Henrik): lägg SQL i en fil och be Henrik köra den i SQL Editor, eller gör det i appen.
- Repot: GitHub `Lunkster/bdc-statistik` (publikt, Pages från `main` / rot) – Henrik pushar själv.
