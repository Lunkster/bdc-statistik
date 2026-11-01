// Admin → Export (v0.7.1): hela databasen som CSV (en fil per tabell och vy) och som SQL
// (data.sql med insert-satser + schemafilerna ur repot), samlat i en zip-fil.
// Allt hämtas med adminens inloggning (RLS) i omgångar om 1 000 rader.
import { api, esc, fmt, heltal } from './lib.js?v=0.7.1';

// Tabellerna i den ordning de måste läsas in (främmande nycklar). r = n01:s rådata (jsonb), kan väljas bort.
const TABELLER = [
  ['spelare', 'id', 'id namn visningsnamn medlemsnummer aktiv kommentar skapad fornamn efternamn'],
  ['turnering', 'tdid', 'tdid titel datum starttid serie omgang status startpoang n01_uppdaterad hamtad data:r'],
  ['tavling', 'id', 'id namn typ serie fran till n01_lgid kvalgrans regler:j aktiv kommentar skapad'],
  ['deltagare', 'tdid,tpid', 'tdid tpid namn ordning'],
  ['match', 'mid', 'mid tdid tmid scid ttype rond t_no match_type startpoang legs_for_vinst starttid klar n01_uppdaterad data:r'],
  ['match_spelare', 'mid,sida', 'mid sida tdid tpid namn legs poang pilar'],
  ['leg', 'mid,nr', 'mid nr forst vinnare mfd starttid'],
  ['kast', 'mid,leg_nr,sida,runda', 'mid leg_nr sida runda poang kvar pilar utgang'],
  ['turnering_statistik', 'tdid,typ', 'tdid typ data:j'],
  ['alias', 'id', 'id n01_namn tdid spelare_id skapad'],
  ['alias_logg', 'id', 'id tid handling n01_namn tdid fran_spelare till_spelare konto'],
  ['hamtning', 'id', 'id start slut kalla status nya_turneringar nya_matcher meddelande'],
  ['tavling_val', 'tavling_id,tdid', 'tavling_id tdid roll'],
  ['poang_manuell', 'id', 'id tavling_id spelare_id n01_namn kategori antal kommentar'],
  ['uppgift', 'id', 'id titel beskrivning ansvar kategori lank status klar_tid kommentar ordning skapad'],
  ['ds_division', 'tdid', 'tdid tavling_id titel division status startpoang n01_uppdaterad hamtad data:r tabell:j spelarstatistik:j'],
  ['ds_lag', 'tdid,tpid', 'tdid tpid namn ordning bankeryd'],
  ['ds_lagmatch', 'tdid,nyckel', 'tdid nyckel lag_a lag_b vunna_a vunna_b snitt_a snitt_b datum'],
  ['ds_match', 'mid', 'mid tdid nyckel schid nr delmatch dubbel legs_for_vinst starttid klar n01_uppdaterad data:r'],
  ['ds_match_sida', 'mid,sida', 'mid sida lag_tpid legs poang pilar'],
  ['ds_match_spelare', 'mid,sida,plats', 'mid sida plats oid namn'],
  ['ds_leg', 'mid,nr', 'mid nr forst vinnare mfd'],
  ['ds_kast', 'mid,leg_nr,sida,runda', 'mid leg_nr sida runda poang kvar pilar utgang'],
  ['ds_alias', 'tdid,oid', 'tdid oid spelare_id skapad'],
].map(([namn, pk, kol]) => ({ namn, pk, kol: kol.split(' ').map((k) => { const [c, t] = k.split(':'); return { c, json: !!t, radata: t === 'r' }; }) }));
const IDENTITET = ['spelare', 'tavling', 'alias', 'alias_logg', 'hamtning', 'poang_manuell', 'uppgift'];
// Vyer med uträknad statistik – bara som CSV (de räknas fram ur tabellerna)
const VYER = [
  ['v_turnering', 'tdid'], ['v_turnering_statistik', 'tdid,tpid'], ['v_match', 'mid'], ['v_spelare_match', 'mid,sida'],
  ['v_cup_poang', 'tavling_id,spelare_id,n01_namn'], ['v_ds_tabell', 'tdid,placering'], ['v_ds_lagmatch', 'tdid,nyckel'],
  ['v_ds_spelare', 'tdid,oid'], ['v_ds_match', 'mid'],
];
const SCHEMA = ['01_schema', '02_index_och_anon', '03_hamtning_schema', '04_vyer', '05_vyer_skrivskydd', '06_konton',
  '07_statistik_utan_borttagna', '08_spelare_match', '09_spelare_match_snabb', '10_admin', '11_f9_summor', '12_cuper',
  '13_logga_alias_stang', '14_uppgift', '15_ta_bort_spelare', '16_distriktsserien'];
const SIDA = 1000;

// ---------- hämta ----------
async function hamtaAlla(namn, select, pk, pagar) {
  // Läser tills en tom sida kommer – säkert även om servern ger färre rader per anrop än SIDA
  const rader = [];
  for (;;) {
    const del = await api(`${namn}?select=${select}&order=${pk.split(',').map((k) => `${k}.asc.nullsfirst`).join(',')}&limit=${SIDA}&offset=${rader.length}`);
    if (!del.length) return rader;
    rader.push(...del);
    pagar?.(rader.length);
  }
}

// ---------- CSV: semikolon, decimalkomma, tider i svensk tid (öppnas direkt i svenskt Excel) ----------
const TID = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function svTid(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
function csvVarde(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (typeof v === 'object') s = JSON.stringify(v);
  else if (typeof v === 'number') s = String(v).replace('.', ',');
  else if (typeof v === 'string' && TID.test(v)) s = svTid(v);
  else s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function tillCsv(rader, kolumner) {
  const kol = kolumner ?? Object.keys(rader[0] ?? {});
  return '﻿' + [kol.join(';'), ...rader.map((r) => kol.map((k) => csvVarde(r[k])).join(';'))].join('\r\n') + '\r\n';
}

// ---------- SQL: insert-satser, exakta värden ----------
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
function sqlVarde(v, json) {
  if (v === null || v === undefined) return 'null';
  if (json) return `${sqlText(JSON.stringify(v))}::jsonb`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return sqlText(v);
}
export function tillSql(tabell, kol, rader) {
  if (!rader.length) return `-- ${tabell}: inga rader\n`;
  const over = IDENTITET.includes(tabell) ? ' overriding system value' : '';
  const ut = [`-- ${tabell}: ${rader.length} rader`];
  for (let i = 0; i < rader.length; i += 500) {
    ut.push(`insert into public.${tabell} (${kol.map((k) => k.c).join(', ')})${over} values\n` +
      rader.slice(i, i + 500).map((r) => `(${kol.map((k) => sqlVarde(r[k.c], k.json)).join(', ')})`).join(',\n') + ';');
  }
  if (IDENTITET.includes(tabell)) ut.push(`select setval(pg_get_serial_sequence('public.${tabell}', 'id'), coalesce(max(id), 1)) from public.${tabell};`);
  return ut.join('\n') + '\n';
}

// ---------- zip (okomprimerad, UTF-8-filnamn) ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zip(filer) {
  const enc = new TextEncoder();
  const delar = [], central = [];
  let offset = 0;
  const nu = new Date();
  const dosTid = (nu.getHours() << 11) | (nu.getMinutes() << 5) | (nu.getSeconds() >> 1);
  const dosDatum = ((nu.getFullYear() - 1980) << 9) | ((nu.getMonth() + 1) << 5) | nu.getDate();
  for (const [namn, innehall] of filer) {
    const data = typeof innehall === 'string' ? enc.encode(innehall) : innehall;
    const n = enc.encode(namn), crc = crc32(data);
    const lokal = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTid, 2], [12, dosDatum, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, l]) => (l === 4 ? lokal.setUint32(o, v, true) : lokal.setUint16(o, v, true)));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTid, 2], [14, dosDatum, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4],
      [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, l]) => (l === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    delar.push(lokal, n, data); central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const storlek = central.reduce((s, x) => s + x.byteLength, 0);
  const slut = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, filer.length, 2], [10, filer.length, 2], [12, storlek, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([o, v, l]) => (l === 4 ? slut.setUint32(o, v, true) : slut.setUint16(o, v, true)));
  return new Blob([...delar, ...central, slut], { type: 'application/zip' });
}

function ladda(blob, filnamn) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filnamn;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
const idag = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());

const LASMIG = (medRadata, antal) => `BDC Statistik – export ${idag()}

Databasen bakom https://lunkster.github.io/bdc-statistik/ (Supabase-projektet bdc-statistik).

csv/       En fil per tabell och vy. Semikolon som avgränsare, decimalkomma, tider i svensk tid
           (ÅÅÅÅ-MM-DD TT:MM:SS), UTF-8. Öppnas direkt i Excel. jsonb-kolumner som JSON-text.
           Vyerna (v_*) innehåller den uträknade statistiken – samma siffror som i appen.
sql/schema/ Schemat: tabeller, vyer, roller och regler, i den ordning de skapades (01–16).
sql/data.sql Alla tabellers rader som insert-satser, i rätt ordning för främmande nycklar.
           Tider i UTC. Läses in efter schemat i en tom databas, t.ex. i Supabase SQL Editor.
${medRadata ? '' : '\nOBS: exporterad UTAN n01:s rådata (kolumnen data i turnering, match, ds_division och ds_match är tom).\nRäcker för statistik och analys, men appen kan inte återskapas helt ur den här exporten.\n'}
Relationer i korthet (se docs/datamodell.md i repot för diagram):
  turnering 1–n deltagare, match, turnering_statistik
  match 1–2 match_spelare, 1–n leg; leg 1–n kast (en rad per runda)
  spelare 1–n alias (n01-namn → person, allmänt eller per turnering)
  tavling (cup) 1–n tavling_val, poang_manuell
  distriktsserien: ds_division 1–n ds_lag, ds_lagmatch, ds_match; ds_match 1–2 ds_match_sida 1–2 ds_match_spelare; ds_leg, ds_kast; ds_alias

Antal rader:
${antal.map(([n, a]) => `  ${n.padEnd(24)} ${String(a).padStart(8)}`).join('\n')}
`;

export async function visaExport(app, meny) {
  app.innerHTML = `
    <h1>Export</h1>${meny}
    <div class="kort">
      <h2>Hela databasen</h2>
      <p class="muted liten">En zip-fil med alla tabeller och vyer som CSV (öppnas i Excel), schemat och all data som SQL, och en läsmig-fil som beskriver relationerna.</p>
      <label class="rad liten"><input type="checkbox" id="radata" checked> Med n01:s rådata (krävs för att kunna återskapa appen; gör filen större)</label>
      <p><button class="btn" id="exportera">Ladda ner allt (zip)</button></p>
      <p id="status" class="liten" role="status"></p>
    </div>
    <h2>En tabell i taget (CSV)</h2>
    <div class="rulla"><table class="tabell export">
      <thead><tr><th class="fast">Tabell / vy</th><th></th></tr></thead>
      <tbody>${[...TABELLER.map((t) => t.namn), ...VYER.map(([v]) => v)].map((n) => `<tr><td class="fast">${esc(n)}</td>
        <td><button type="button" class="btn liten sekundar csv" data-namn="${esc(n)}">CSV</button></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted liten">Kräver adminbehörighet. Uppgifter om personer – hantera filerna därefter.</p>`;
  const status = app.querySelector('#status');
  const urval = (t, medRadata) => t.kol.filter((k) => medRadata || !k.radata);

  app.querySelectorAll('.csv').forEach((b) => b.addEventListener('click', async () => {
    const n = b.dataset.namn; b.disabled = true;
    try {
      const t = TABELLER.find((x) => x.namn === n), v = VYER.find(([x]) => x === n);
      const rader = t ? await hamtaAlla(n, urval(t, true).map((k) => k.c).join(','), t.pk) : await hamtaAlla(n, '*', v[1]);
      ladda(new Blob([tillCsv(rader, t ? t.kol.map((k) => k.c) : undefined)], { type: 'text/csv;charset=utf-8' }), `${n}_${idag()}.csv`);
    } catch (e) { status.textContent = `Fel: ${e.message}`; } finally { b.disabled = false; }
  }));

  app.querySelector('#exportera').addEventListener('click', async (e) => {
    const medRadata = app.querySelector('#radata').checked;
    e.target.disabled = true;
    try {
      const filer = [], sql = [
        `-- BDC Statistik – data ${idag()}${medRadata ? '' : ' (utan n01:s rådata)'}`,
        '-- Läs in efter schemat (sql/schema/01–16). Triggrar stängs av under inläsningen så att ändringsloggen inte fylls på dubbelt.',
        'begin;', 'set session_replication_role = replica;', ''];
      const antal = [];
      for (const t of TABELLER) {
        const kol = urval(t, medRadata);
        const rader = await hamtaAlla(t.namn, kol.map((k) => k.c).join(','), t.pk, (n) => { status.textContent = `Hämtar ${t.namn} … ${heltal(n)} rader`; });
        antal.push([t.namn, rader.length]);
        filer.push([`csv/${t.namn}.csv`, tillCsv(rader, kol.map((k) => k.c))]);
        sql.push(tillSql(t.namn, kol, rader));
      }
      sql.push('set session_replication_role = origin;', 'commit;', '', '-- Förberäknad statistik', 'select public.uppdatera_statistik();', '');
      for (const [v, pk] of VYER) {
        status.textContent = `Hämtar ${v} …`;
        const rader = await hamtaAlla(v, '*', pk);
        antal.push([v, rader.length]);
        filer.push([`csv/${v}.csv`, tillCsv(rader)]);
      }
      status.textContent = 'Hämtar schemat …';
      for (const s of SCHEMA) {
        const r = await fetch(`supabase/${s}.sql`);
        if (r.ok) filer.push([`sql/schema/${s}.sql`, await r.text()]);
      }
      filer.unshift(['LASMIG.txt', LASMIG(medRadata, antal)], ['sql/data.sql', sql.join('\n')]);
      status.textContent = 'Packar …';
      const blob = zip(filer);
      ladda(blob, `bdc-statistik_${idag()}.zip`);
      status.textContent = `Klart: ${filer.length} filer, ${fmt(blob.size / 1e6, 1)} MB.`;
    } catch (err) { status.textContent = `Fel: ${err.message}`; } finally { e.target.disabled = false; }
  });
}
