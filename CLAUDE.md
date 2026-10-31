# Instruktioner för Claude – Bankeryd Dart Clubs statistik

- Läs först Obsidian `Projekt/Dart-klubbdatabas/Dart-klubbdatabas - Projektdokument.md` (tågordning, logg), `Dart-klubbdatabas - Krav.md` och `Dart-klubbdatabas - n01-API.md`.
- Följ skillen `obsidian-projekt`: logga i projektdokumentet, temporära filer i `~/Dokument/Claude/Dart-klubbdatabas/`, aldrig i Obsidian.
- Databasen är Supabase-projektet `bdc-statistik` (`xkfjbrkrtetkbjugresq`) i klubbens eget konto (`lundqvist.henrik@proton.me`). Claudes Supabase-koppling måste vara inloggad med det kontot.
- Källa: n01:s API `https://api.n01darts.com/api/v1`, bara turneringar med "Bankeryd Dart Club" i titeln. Domänen är blockerad i Claudes miljöer – importen körs som Edge Function.
- Roller i `app_metadata.roll`: `medlem` (läser) och `admin` (läser, kopplar namn, startar hämtning). Importen skriver med service role.
- Schemaändringar: ny numrerad fil i `supabase/` + `apply_migration` (namn `bdc_NN_...`). Kör `get_advisors` efteråt. Uppdatera `docs/datamodell.md` och kopian i Obsidian.
- Lagra aldrig härledda värden – lägg logiken i vyerna. Rådata från n01 sparas i `data` (jsonb).
- Format enligt SI: ÅÅÅÅ-MM-DD, 24 h, decimalkomma, `toLocaleString("sv-SE")`.
- Inga personuppgifter, exporter eller nycklar (utom publishable key) i repot.
