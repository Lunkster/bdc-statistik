# bdc-statistik

Klubbstatistik för Bankeryd Dart Club ur turneringarna på n01darts.com. Statisk webbapp (GitHub Pages) + Supabase.

- Appen: `index.html`, `app.js` (router, inloggning), `turneringar.js`, `turnering.js`, `spelare.js`, `admin.js`, `lib.js`, `style.css`
- `supabase/` – schema och vyer som numrerade SQL-filer, Edge Function `hamta` (hämtar från n01)
- `docs/datamodell.md` – databasdiagram
- `tests/test.mjs` – test med attrapp (rör aldrig databasen): `node tests/test.mjs` (kräver Playwright)

All data ligger bakom inloggning; den publika nyckeln i `lib.js` ger ingen åtkomst utan konto.
