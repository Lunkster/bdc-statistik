// Attrapp-test: kör appen mot fasta data, amerikanska inställningar, kontrollerar format och fel.
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROT = new URL('..', import.meta.url).pathname;
const F = JSON.parse(fs.readFileSync(new URL('fixtur.json', import.meta.url), 'utf8'));
const typer = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/bdc-statistik/, '') || '/index.html');
  const fil = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(ROT, 'index.html');
  res.writeHead(200, { 'Content-Type': typer[path.extname(fil)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(fil));
}).listen(8765);

const jwt = (roll) => 'x.' + Buffer.from(JSON.stringify({ app_metadata: { roll } })).toString('base64url') + '.y';
let roll = 'admin';
const fel = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York', viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => fel.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') fel.push('console: ' + m.text()); });
await page.route('https://xkfjbrkrtetkbjugresq.supabase.co/**', async (route) => {
  const u = new URL(route.request().url());
  const svara = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (u.pathname.startsWith('/auth/v1/token')) {
    const b = JSON.parse(route.request().postData());
    if (b.password !== 'rattkod') return svara({ error: 'invalid' }, 400);
    roll = b.email.includes('bdcadmin') ? 'admin' : 'medlem';
    return svara({ access_token: jwt(roll), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 });
  }
  if (u.pathname.startsWith('/functions/v1/hamta')) return svara({ ok: true, klart: true, kvar: 0, turneringar: 1, matcher: 30 });
  const tabell = u.pathname.split('/').pop();
  const q = u.searchParams;
  if (tabell === 'v_turnering') return svara(q.get('tdid') ? F.turn : F.lista);
  if (tabell === 'turnering') return svara(F.rad);
  if (tabell === 'v_turnering_statistik') {
    if (q.get('spelare_id')) return svara(F.stat.filter((s) => `eq.${s.spelare_id}` === q.get('spelare_id')));
    if (q.get('namn')) return svara(F.stat.filter((s) => `eq.${s.namn}` === q.get('namn')));
    return svara(F.stat);
  }
  if (tabell === 'v_match') return svara(F.match);
  if (tabell === 'spelare') return svara(F.spelare);
  if (tabell === 'alias') return svara(F.alias);
  if (tabell === 'hamtning') return svara(F.hamtning);
  if (tabell === 'v_deltagare') return svara([{ namn: 'Ada' }, { namn: 'Ada' }, { namn: 'Bo' }]);
  return svara([], 404);
});

const B = 'http://localhost:8765/bdc-statistik/';
const kontroll = async (namn) => {
  const text = await page.locator('body').innerText();
  if (/\b(AM|PM)\b|\d{1,2}\/\d{1,2}\/\d{4}|\d,\d{3}\b/.test(text.replace(/\d{1,2}\/\d{1,2}(?!\/)/g, ''))) fel.push(`${namn}: amerikanskt format i texten`);
  await page.screenshot({ path: `/tmp/bdc-${namn}.png`, fullPage: true });
};

// 1. Fel kod
await page.goto(B);
await page.fill('input[name=kod]', 'fel'); await page.click('button.btn');
await page.waitForSelector('.fel:text("Fel kod.")');
// 2. Medlem
await page.fill('input[name=kod]', 'rattkod'); await page.click('button.btn');
await page.waitForSelector('.turnrad');
if (await page.locator('#adminlank').isVisible()) fel.push('medlem ser adminlänken');
await kontroll('1-turneringar');
await page.click('.chip[data-serie="Söndagscup"]');
if ((await page.locator('.turnrad').count()) !== 1) fel.push('filter fungerar inte');
await page.click('.chip[data-serie=""]');
// 3. Turnering
await page.click('.turnrad >> nth=0');
await page.waitForSelector('#stat table');
await kontroll('2-turnering');
const forsta = await page.locator('#stat tbody tr >> nth=0 >> td >> nth=0').innerText();
if (forsta !== 'Ada') fel.push('sortering på placering: ' + forsta);
await page.click('[data-sort="snitt"]');
const efterSnitt = await page.locator('#stat tbody tr >> nth=0 >> td >> nth=0').innerText();
if (efterSnitt !== 'Ada') fel.push('sortering snitt (högst först) gav ' + efterSnitt);
await page.click('[data-sort="snitt"]');
const lagst = await page.locator('#stat tbody tr >> nth=0 >> td >> nth=0').innerText();
if (lagst !== 'Fia') fel.push('sortering snitt (lägst först) gav ' + lagst);
const grupper = await page.locator('.grupp').count(); if (grupper !== 2) fel.push('grupper: ' + grupper);
const g1 = await page.locator('.grupp >> nth=0 >> tbody tr >> nth=0').innerText();
if (!g1.startsWith('Bo')) fel.push('gruppetta grupp A: ' + g1);
const ronder = await page.locator('.rond h3').allInnerTexts();
if (ronder.join(',') !== 'Kvartsfinal,Semifinal,Final') fel.push('rondnamn: ' + ronder);
if (!(await page.locator('body').innerText()).includes('43,63')) fel.push('decimalkomma saknas');
// 4. Spelare (kopplad) och okopplat namn
await page.click('a[href="#/spelare/47"] >> nth=0');
await page.waitForSelector('.nyckeltal');
await kontroll('3-spelare');
await page.goto(B + '#/namn/Ada');
await page.waitForSelector('.nyckeltal');
await kontroll('4-namn');
await page.goto(B + '#/spelare');
await page.waitForSelector('table');
await kontroll('5-spelarlista');
// 5. Admin
await page.goto(B + '#/loggaut'); await page.waitForSelector('#login');
await page.fill('input[name=kod]', 'rattkod'); await page.check('input[name=admin]'); await page.click('button.btn');
await page.waitForSelector('.turnrad');
if (!(await page.locator('#adminlank').isVisible())) fel.push('admin ser inte adminlänken');
await page.goto(B + '#/admin'); await page.waitForSelector('#hamta');
await page.click('#hamta'); await page.waitForSelector('#hamtsvar:text("Klart")');
await kontroll('6-admin');
// 6. Skrivbord
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(B + '#/turnering/t_nRTA_1280'); await page.waitForSelector('#stat table');
await page.screenshot({ path: '/tmp/bdc-7-turnering-dator.png', fullPage: true });

await browser.close(); server.close();
const riktiga = fel.filter((f) => !f.includes('400 (Bad Request)'));
console.log(riktiga.length ? 'FEL:\n' + riktiga.join('\n') : '0 fel');
