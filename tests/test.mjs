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

// 1×1 px PNG för porträtt i attrappen
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const jwt = (roll) => 'x.' + Buffer.from(JSON.stringify({ app_metadata: { roll } })).toString('base64url') + '.y';
let roll = 'admin';
const fel = [];
const skrivningar = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York', viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => fel.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') fel.push('console: ' + m.text()); });
await page.route('https://xkfjbrkrtetkbjugresq.supabase.co/**', async (route) => {
  const u = new URL(route.request().url());
  const sq = u.searchParams;
  // offset/limit som PostgREST (exporten läser i sidor tills en tom sida kommer)
  const svara = (data, status = 200) => {
    if (Array.isArray(data) && sq.get('offset') !== null) data = data.slice(Number(sq.get('offset')), Number(sq.get('offset')) + Number(sq.get('limit') ?? 1e9));
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  };
  if (u.pathname.startsWith('/auth/v1/token')) {
    const b = JSON.parse(route.request().postData());
    if (b.password !== 'rattkod') return svara({ error: 'invalid' }, 400);
    roll = b.email.includes('bdcadmin') ? 'admin' : 'medlem';
    return svara({ access_token: jwt(roll), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 });
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/') && route.request().method() === 'POST') return svara(JSON.parse(route.request().postData()).paths.map((p) => ({ path: p, signedURL: `/object/sign/portratt/${p}?token=x` })));
  if (u.pathname.startsWith('/storage/v1/object/sign/portratt/') || (u.pathname.startsWith('/storage/v1/') && route.request().method() === 'GET'))
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  if (u.pathname.startsWith('/storage/v1/object/portratt/')) { skrivningar.push(`${route.request().method()} storage ${u.pathname}`); return svara({ Key: 'x' }); }
  if (u.pathname.startsWith('/functions/v1/hamta')) return svara({ ok: true, klart: true, kvar: 0, turneringar: 1, matcher: 30 });
  const tabell = u.pathname.split('/').pop();
  const q = u.searchParams;
  if (route.request().method() !== 'GET') { skrivningar.push(`${route.request().method()} ${tabell}${u.search} ${route.request().postData() ?? ''}`);
    return svara(tabell === 'spelare' ? [{ id: 99 }] : []); }
  if (tabell === 'v_turnering') return svara(q.get('tdid') ? F.turn : F.lista);
  if (tabell === 'turnering' && q.get('select') === 'tdid,startpoang') return svara([...F.lista.map((t) => ({ tdid: t.tdid, startpoang: t.serie === 'Söndagscup' ? 301 : 501 }))]);
  if (tabell === 'turnering') return svara((q.get('select') ?? '').includes('titel') ? F.turnlista : F.rad);
  if (tabell === 'tavling') return svara(q.get('typ') === 'eq.distriktsserie' ? F.ds_liga : F.tavling.filter((r) => !(q.get('id') ?? '').startsWith('in.') || q.get('id').slice(4, -1).split(',').includes(String(r.id))));
  if (tabell === 'ds_division') return svara(F.ds_division);
  if (tabell === 'ds_lag') return svara(F.ds_lag);
  if (tabell === 'ds_alias') return svara([]);
  if (tabell === 'v_ds_tabell') return svara(F.ds_tabell.filter((r) => `eq.${r.tdid}` === q.get('tdid') || (q.get('tdid') ?? '').includes(`"${r.tdid}"`)));
  if (tabell === 'v_rekord_leg') return svara(q.get('utgang') ? [{ mid: 'm00', tdid: 't_nRTA_1280', datum: '2026-10-29', namn: 'Dag', spelare_id: 47, mot_namn: 'Bo', utgang: 121 }]
    : [{ mid: 'm00', tdid: 't_nRTA_1280', datum: '2026-10-29', namn: 'Dag', spelare_id: 47, mot_namn: 'Bo', pilar: 15, snitt: 100.2 }, { mid: 'm01', tdid: 't_nRTA_1280', datum: '2026-10-29', namn: 'Bo', spelare_id: null, mot_namn: 'Dag', pilar: 17, snitt: 88.41 },
      ...[18, 19, 20].map((p) => ({ mid: 'm02', tdid: 't_nRTA_1280', datum: '2026-10-29', namn: 'Cid', spelare_id: 50, mot_namn: 'Bo', pilar: p, snitt: Math.round(150300 / p) / 100 }))]);
  if (tabell === 'v_ds_lagmatch') return svara(F.ds_lagmatch.filter((r) => `eq.${r.tdid}` === q.get('tdid') && (!q.get('nyckel') || `eq.${r.nyckel}` === q.get('nyckel'))));
  if (tabell === 'v_ds_spelare') {
    if (q.get('spelare_id') === 'is.null') return svara(F.ds_spelare.filter((r) => !r.spelare_id));
    if (q.get('spelare_id')) return svara(F.ds_spelare.filter((r) => `eq.${r.spelare_id}` === q.get('spelare_id')));
    return svara(F.ds_spelare.filter((r) => !q.get('tdid') || `eq.${r.tdid}` === q.get('tdid')));
  }
  if (tabell === 'v_ds_match') return svara(F.ds_match.filter((r) => (!q.get('mid') || `eq.${r.mid}` === q.get('mid')) && (!q.get('nyckel') || `eq.${r.nyckel}` === q.get('nyckel'))));
  if (tabell === 'ds_leg') return svara(F.leg);
  if (tabell === 'ds_kast') return svara(F.kast);
  if (tabell === 'v_tavling_turnering') return svara(F.tt.filter((r) => !q.get('tdid') || `eq.${r.tdid}` === q.get('tdid')));
  if (tabell === 'v_cup_poang') return svara(F.cup_poang);
  if (tabell === 'tavling_val' || tabell === 'poang_manuell') return svara([]);
  if (tabell === 'uppgift') return svara(F.uppgift);
  if (tabell === 'v_turnering_statistik') {
    if (q.get('spelare_id')) return svara(F.stat.filter((s) => `eq.${s.spelare_id}` === q.get('spelare_id')));
    if (q.get('namn')) return svara(F.stat.filter((s) => `eq.${s.namn}` === q.get('namn')));
    return svara(F.stat);
  }
  if (tabell === 'v_match') return svara(F.match);
  if (tabell === 'v_spelare_match') {
    if (q.get('mid')) { const m = F.spelare_match.find((x) => `eq.${x.mid}` === q.get('mid'));
      return svara(m ? [m, { ...m, sida: 1, namn: m.mot_namn, spelare_id: null, mot_namn: m.namn, legs_vunna: m.legs_forlorade, legs_forlorade: m.legs_vunna, vann: !m.vann }] : []); }
    if (q.get('spelare_id') === 'eq.47') return svara(F.spelare_match);
    return svara([]);
  }
  if (tabell === 'v_namn_underlag') return svara(F.underlag);
  if (tabell === 'alias_logg') return svara(F.alias_logg);
  if (tabell === 'leg') return svara(F.leg);
  if (tabell === 'kast') return svara(F.kast);
  if (tabell === 'turnering_statistik') return svara(F.n01stat);
  if (tabell === 'v_turnering_utgang') return svara(F.utgang);
  if (tabell === 'spelare' && q.get('bild')) return svara([{ id: 47, bild: '47.jpg?v=1' }]);
  if (tabell === 'spelare') return svara(F.spelare);
  if (tabell === 'alias') return svara(q.get('n01_namn') ? [] : F.alias);
  if (tabell === 'hamtning') return svara(F.hamtning);
  if (tabell === 'v_deltagare') return svara([{ namn: 'Ada' }, { namn: 'Ada' }, { namn: 'Bo' }]);
  if (['turnering_statistik', 'deltagare', 'match', 'match_spelare', 'ds_lagmatch', 'ds_match', 'ds_match_sida', 'ds_match_spelare'].includes(tabell)) return svara([]);
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
await page.waitForSelector('.tavlingsrad');
if (await page.locator('#adminlank').isVisible()) fel.push('medlem ser adminlänken');
await page.waitForSelector('.karusell .bild');
if ((await page.locator('.karusell .bild').count()) < 3) fel.push('karusell: för få bilder ' + await page.locator('.karusell .bild').count());
if ((await page.locator('.karusell .bild tr.vart').count()) !== 1) fel.push('karusell: Bankeryd markeras inte i serietabellen');
if ((await page.locator('.karusell .kartabell').count()) < 3) fel.push('karusell: tabeller saknas');
await page.click('.karusell .prick >> nth=1'); await page.waitForTimeout(600);
if (!(await page.locator('.karusell .prick >> nth=1').getAttribute('class')).includes('vald')) fel.push('karusell: prickarna byter inte bild');
await page.click('.karusell .prick >> nth=0'); await page.waitForTimeout(600);
await kontroll('1-turneringar');
await page.click('.chip[data-serie="Söndagscup"]');
if ((await page.locator('.tavlingsrad').count()) !== 1) fel.push('filter fungerar inte');
await page.click('.chip[data-serie=""]');
// 2b. Rekord och helskärmskarusell
await page.click('a[data-route="rekord"]'); await page.waitForSelector('.rekordlista');
if ((await page.locator('.rekordlista').count()) !== 7) fel.push('rekord: antal listor ' + await page.locator('.rekordlista').count());
await page.evaluate(() => {});
const nav = await page.locator('.tabs a').allInnerTexts();
if (nav.slice(0, 5).join(',') !== 'Tävlingar,Cuper,Serien,Spelare,Rekord') fel.push('menyns ordning: ' + nav.join(','));
if (!(await page.locator('.rekordlista >> nth=0').innerText()).includes('15 pilar')) fel.push('rekord: bästa leg');
if ((await page.locator('.rekordlista >> nth=0 >> li:visible').count()) !== 3) fel.push('rekord: ska visa tre');
await page.click('.rekordlista >> nth=0 >> .fler');
if ((await page.locator('.rekordlista >> nth=0 >> li:visible').count()) !== 5) fel.push('rekord: expanderar inte');
await page.click('.rekordlista >> nth=0 >> .fler');
if ((await page.locator('.rekordlista >> nth=0 >> li:visible').count()) !== 3) fel.push('rekord: fäller inte ihop');
if (!(await page.locator('.rekordsida').innerText()).includes('100,20')) fel.push('rekord: decimalkomma');
await kontroll('2b-rekord');
await page.goto(B + '#/karusell'); await page.waitForSelector('.karusell.helskarm');
await page.mouse.move(200, 300);   // musen över karusellen ska inte stoppa den i helskärm
await page.waitForFunction(() => document.querySelector('.karusell .prick.vald')?.dataset.i === '1', null, { timeout: 20000 }).catch(() => fel.push('karusell: helskärm startar inte av sig själv'));
if (await page.locator('.topbar').isVisible()) fel.push('karusell: menyn syns i helskärm');
await kontroll('2c-karusell');
await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/bdc-2d-karusell-tv.png' }); await page.setViewportSize({ width: 390, height: 844 });
await page.click('.karusell a:text("Stäng")'); await page.waitForSelector('.tavlingsrad');
if (!(await page.locator('.topbar').isVisible())) fel.push('karusell: menyn kommer inte tillbaka');
// 3. Tävling: flikarna Resultat, Matcher, Statistik
await page.click('.tavlingsrad >> nth=0');
await page.waitForSelector('.tavlingsflikar');
await kontroll('2-turnering');
if ((await page.locator('a.cuplank[href="#/cup/1"]').count()) !== 1) fel.push('turnering: länk till cupen saknas');
if ((await page.locator('.tavlingsflikar [data-flik]').allInnerTexts()).join(',') !== 'Resultat,Matcher,Statistik') fel.push('flikar: fel namn eller ordning');
if (await page.locator('#stat').isVisible()) fel.push('flikar: statistiken ska inte synas på Resultat');
// Resultat: vinnare, slutspelsträd, gruppspel i den ordningen
const ordning = await page.evaluate(() => ['.vinnarrad', '.trad', '.grupper'].map((q) => document.querySelector(q)?.getBoundingClientRect().top ?? -1));
if (!(ordning[0] >= 0 && ordning[0] < ordning[1] && ordning[1] < ordning[2])) fel.push('resultat: ordningen ska vara vinnare, slutspelsträd, gruppspel: ' + ordning);
const grupper = await page.locator('.grupp').count(); if (grupper !== 2) fel.push('grupper: ' + grupper);
const g1 = await page.locator('.grupp >> nth=0 >> tbody tr >> nth=0').innerText();
if (!g1.startsWith('Bo')) fel.push('gruppetta grupp A: ' + g1);
await page.click('.gruppmatcher summary >> nth=0');
if ((await page.locator('.gruppmatcher >> nth=0 >> a.resultat').count()) < 1) fel.push('grupp: matcherna saknas');
if ((await page.locator('.tr-kol').count()) !== 2) fel.push('slutspelsträd: ska ha Semifinal och Final (ingen vinnarruta)');
if ((await page.locator('.tr-poang').count()) !== 6) fel.push('slutspelsträd: siffrorna ska länka till matcherna');
if (!(await page.locator('.tr-kol.final .tr-spelare.vann').innerText()).includes('Ada')) fel.push('slutspelsträd: Ada ska vara fet i finalen');
const ronder = await page.locator('.tr-kol h3').allInnerTexts();
if (ronder.join(',') !== 'Semifinal,Final') fel.push('rondnamn i trädet: ' + ronder);
const regel = await page.locator('.rundregel').innerText();
if (!regel.includes('gruppspel max 13 rundor (39 pilar var)') || !regel.includes('slutspel max 9 rundor (27 pilar var)')) fel.push('rundregel: ' + regel);
await kontroll('2-resultat');
// Matcher
await page.click('[data-flik="matcher"]');
if (!page.url().endsWith('/matcher')) fel.push('flikar: adressen ska sluta på /matcher: ' + page.url());
if ((await page.locator('.tl-rad').count()) !== 4) fel.push('tidslinje: ska visa 4 matcher');
const tl1 = await page.locator('.tl-huvud >> nth=0').innerText();
if (!tl1.includes('20:30') || !tl1.includes('Final')) fel.push('tidslinje: senaste först ska vara finalen 20:30 svensk tid: ' + tl1);
await page.click('.tl-ordning [data-ordning="forst"]');
const tl2 = await page.locator('.tl-huvud >> nth=0').innerText();
if (!tl2.includes('18:10') || !tl2.includes('Grupp A')) fel.push('tidslinje: första först: ' + tl2);
await kontroll('2b-tidslinje');
// Statistik
await page.click('[data-flik="statistik"]');
await page.waitForSelector('#stat table');
if (!page.url().endsWith('/statistik')) fel.push('flikar: adressen ska sluta på /statistik');
if ((await page.locator('.topp').count()) < 1) fel.push('statistik: topplistorna saknas');
const forsta = await page.locator('#stat tbody tr >> nth=0 >> td >> nth=0').innerText();
if (forsta !== 'Ada') fel.push('sortering på placering: ' + forsta);
await page.click('[data-sort="snitt"]');
const efterSnitt = await page.locator('#stat tbody tr >> nth=0 >> td >> nth=0').innerText();
if (efterSnitt !== 'Ada') fel.push('sortering snitt (högst först) gav ' + efterSnitt);
await page.click('[data-sort="snitt"]');
const lagst = await page.locator('#stat tbody tr >> nth=0 >> td >> nth=0').innerText();
if (lagst !== 'Fia') fel.push('sortering snitt (lägst först) gav ' + lagst);
if (await page.locator('#stat th:has-text("Keep")').isVisible()) fel.push('statistik: Keep ska vara dold i mobilen före Detaljer');
await page.click('.stat-detaljer');
if (!(await page.locator('#stat th:has-text("Keep")').isVisible())) fel.push('statistik: Detaljer visar inte Keep');
const adaRad = await page.locator('#stat tbody tr:has-text("Ada")').innerText();
if (!adaRad.includes('88,9 %') || !adaRad.includes('75,0 %') || !/\bF\b/.test(adaRad)) fel.push('statistik: Keep/Break/Omg för Ada: ' + adaRad.replace(/\s+/g, ' '));
if (!adaRad.includes('35,0 %')) fel.push('statistik: Utgång-% för Ada ska vara 35,0 %');
if (!(await page.locator('#stat th:has-text("Checkout-%")').isVisible())) fel.push('statistik: Checkout-% saknas');
if (!(await page.locator('body').innerText()).includes('43,63')) fel.push('decimalkomma saknas');
await kontroll('2a-statistik-detaljer');
// Direktlänk till en flik
await page.goto(B + '#/tavling/t_nRTA_1280/matcher'); await page.waitForSelector('.tl-rad');
if (!(await page.locator('[data-flik="matcher"]').getAttribute('class')).includes('vald')) fel.push('flikar: direktlänken öppnar inte Matcher');
// 4. Spelare (kopplad) och okopplat namn
await page.click('a[href="#/spelare/47"]:visible >> nth=0');
await page.waitForSelector('.nyckeltal');
await kontroll('3-spelare');
if ((await page.locator('.graf:has-text("För få värden")').count()) !== 6) fel.push('per turnering med en turnering ska visa för få värden');
await page.click('[data-lage="match"]');
const punkter = await page.locator('.graf >> nth=0 >> .punkt').count(); if (punkter !== 21) fel.push('punkter per match: ' + punkter);
await page.locator('.graf >> nth=0 >> svg').hover({ position: { x: 150, y: 60 } });
if (await page.locator('.graf >> nth=0 >> .tooltip').isHidden()) fel.push('tooltip visas inte');
await kontroll('3b-spelare-per-match');
if ((await page.locator('.spelarflikar [data-flik]').allInnerTexts()).join(',') !== 'Statistik,Tävlingar,Matcher') fel.push('spelarsidan: flikarna');
if (await page.locator('#matchlista').isVisible()) fel.push('spelarsidan: matcherna ska inte synas på Statistik');
await page.click('.spelarflikar [data-flik="matcher"]');
if (!page.url().endsWith('#/spelare/47/matcher')) fel.push('spelarsidan: adressen för Matcher: ' + page.url());
if ((await page.locator('#matchlista tbody tr').count()) !== 15) fel.push('spelarsidan: matchlistan ska visa 15');
await page.click('#alla-matcher');
if ((await page.locator('#matchlista tbody tr').count()) !== 21) fel.push('spelarsidan: visa alla matcher');
if ((await page.locator('#matchlista a.resultat').count()) !== 21) fel.push('spelarsidan: resultaten ska länka till matchen');
if ((await page.locator('.portratt img').count()) !== 1) fel.push('porträtt saknas på spelarsidan');
await page.click('#matchlista [data-sort="snitt"]');
const msnitt = (await page.locator('#matchlista tbody tr td:nth-child(4)').allInnerTexts()).map((x) => Number(x.replace(',', '.')));
if (msnitt.some((v, i) => i && v > msnitt[i - 1])) fel.push('matchlistan sorteras inte på snitt: ' + msnitt);
await page.click('#matchlista [data-sort="snitt"]');
const msnitt2 = (await page.locator('#matchlista tbody tr td:nth-child(4)').allInnerTexts()).map((x) => Number(x.replace(',', '.')));
if (msnitt2.some((v, i) => i && v < msnitt2[i - 1])) fel.push('matchlistan vänder inte sorteringen');
await page.click('#matchlista [data-sort="datum"]');
await page.click('.spelarflikar [data-flik="tavlingar"]');
if (!(await page.locator('#turnlista table').isVisible())) fel.push('spelarsidan: fliken Tävlingar visar inte tabellen');
if ((await page.locator('#turnlista [data-sort="snitt"]').count()) !== 1) fel.push('turneringstabellen saknar sortering');
await page.setInputFiles('#bildfil', { name: 'bild.png', mimeType: 'image/png', buffer: PNG }); await page.waitForTimeout(800);
if (!skrivningar.some((s) => s.startsWith('POST storage /storage/v1/object/portratt/47.jpg'))) fel.push('porträtt laddades inte upp: ' + skrivningar.slice(-3).join(' | '));
if (!skrivningar.some((s) => s.startsWith('POST satt_bild') && /"bild":"47\.jpg\?v=\d+"/.test(s))) fel.push('satt_bild anropades inte');
await page.waitForSelector('.spelform');
await page.click('.spelform [data-form="301"]'); await page.waitForTimeout(300);
if (!(await page.locator('.spelform [data-form="301"]').getAttribute('class')).includes('vald')) fel.push('spelform 301 väljs inte');
await page.click('.spelform [data-form="alla"]'); await page.waitForTimeout(300);
if (!(await page.locator('.spelarflikar [data-flik="tavlingar"]').getAttribute('class')).includes('vald')) fel.push('spelarsidan: fliken ska vara kvar efter byte av spelform');
await page.click('.spelarflikar [data-flik="statistik"]');
await page.click('[data-lage="match"]');
const rekord = await page.locator('.rekordkort').count(); if (rekord < 6) fel.push('rekord: ' + rekord);
await page.click('.rekordkort:has-text("Högsta utgång")');
await page.waitForSelector('.leg');
if ((await page.locator('.leg').count()) !== 3) fel.push('legs på matchsidan');
if ((await page.locator('.protokoll td.ut').count()) !== 6) fel.push('utgångar på matchsidan');
if ((await page.locator('.protokoll tr.start').count()) !== 3) fel.push('startpoäng på matchsidan');
if ((await page.locator('.protokoll tr.start td.kvar >> nth=0').innerText()) !== '501') fel.push('startpoäng 501');
if (!/^x\d$/.test(await page.locator('.protokoll td.ut-pilar >> nth=0').innerText())) fel.push('utgången ska visa xN pilar');
if ((await page.locator('.borjade').count()) !== 3) fel.push('* för den som började ska finnas i varje leg');
if (await page.locator('.matchstat tr:has-text("60+")').isVisible()) fel.push('60+ ska vara dold innan Detaljer');
await page.click('.detaljer-knapp');
if (!(await page.locator('.matchstat tr:has-text("60+")').isVisible())) fel.push('Detaljer fälls inte ut');
if (!(await page.locator('.matchstat tr:has-text("120+")').isVisible())) fel.push('120+ saknas under Detaljer');
if (!(await page.locator('.matchstat tr:has-text("Utgång-%")').innerText()).includes('3/9')) fel.push('matchsidan: Utgång-% ska visa 3/9');
await kontroll('3c-match');
await page.click('.detaljer-knapp');
await page.goto(B + '#/namn/Ada');
await page.waitForSelector('.nyckeltal');
await kontroll('4-namn');
await page.goto(B + '#/spelare');
await page.waitForSelector('table');
await kontroll('5-spelarlista');
// 5. Admin
await page.goto(B + '#/loggaut'); await page.waitForSelector('#login');
await page.fill('input[name=kod]', 'rattkod'); await page.check('input[name=admin]'); await page.click('button.btn');
await page.waitForSelector('.tavlingsrad');
if (!(await page.locator('#adminlank').isVisible())) fel.push('admin ser inte adminlänken');
await page.goto(B + '#/admin'); await page.waitForSelector('#hamta');
await page.click('#hamta'); await page.waitForSelector('#hamtsvar:text("Klart")');
await kontroll('6-admin');
// 4b. Spelarlistan: sortering, nyheter
await page.goto(B + '#/spelare'); await page.waitForSelector('#spelarlista table');
const huvud = await page.locator('#spelarlista th').allInnerTexts();
if (!huvud.some((h) => h.includes('180')) || !huvud.some((h) => h.toLowerCase().includes('first 9'))) fel.push('spelarlistan saknar kolumner: ' + huvud);
await page.click('[data-sort="snitt"]');
const snitt = (await page.locator('#spelarlista tbody tr td:nth-child(5)').allInnerTexts()).map((x) => Number(x.replace(',', '.'))).filter((x) => !Number.isNaN(x));
if (snitt.some((v, i) => i && v > snitt[i - 1])) fel.push('sortering på snitt: ' + snitt);
await page.click('[data-sort="namn"]');
const namnLista = await page.locator('#spelarlista tbody tr td:first-child').allInnerTexts();
if (namnLista.join() !== [...namnLista].sort((a, b) => a.localeCompare(b, 'sv')).join()) fel.push('sortering på namn');
if ((await page.locator('#spelarlista img.avatar').count()) < 1) fel.push('avatar saknas i spelarlistan');
await page.click('.spelform [data-form="501"]'); await page.waitForSelector('#spelarlista table');
const antal501 = await page.locator('#spelarlista tbody tr').count();
await page.click('.spelform [data-form="alla"]'); await page.waitForSelector('#spelarlista table');
if (antal501 > (await page.locator('#spelarlista tbody tr').count())) fel.push('spelform filtrerar inte spelarlistan');
await kontroll('5b-spelarlista');
await page.click('a.info'); await page.waitForSelector('.nyhet');
if ((await page.locator('.nyhet li').count()) < 1) fel.push('nyheter');
// 4c. Cuper
await page.click('a[data-route="cuper"]'); await page.waitForSelector('.cupkort');
await page.click('.cupkort'); await page.waitForSelector('.poangtabell');
const forstaCup = await page.locator('.poangtabell tbody tr >> nth=0 >> td >> nth=1').innerText();
if (forstaCup !== 'Ada') fel.push('cup: ledare ' + forstaCup);
if ((await page.locator('.poangtabell tr.kval').count()) !== 2) fel.push('cup: kvalificerade');
const rubriker = await page.locator('.poangtabell th').allInnerTexts();
if (!rubriker.some((r) => r.includes('KS')) || !rubriker.some((r) => r.includes('171'))) fel.push('cup: kolumner ' + rubriker);
await page.click('.poangtabell [data-sort="visas"]');
if ((await page.locator('.poangtabell tbody tr >> nth=0 >> td >> nth=1').innerText()) !== 'Ada') fel.push('cup: sortering på namn');
await kontroll('4c-cup');
// 4d. Distriktsserien
await page.click('a[data-route="serien"]'); await page.waitForSelector('.serietabell');
if ((await page.locator('.serietabell tr.vart').count()) !== 1) fel.push('serien: Bankeryd markeras inte i tabellen');
if ((await page.locator('.filter .chip').count()) !== 2) fel.push('serien: divisionsval');
if ((await page.locator('#ds-spelare tbody tr').count()) !== 2) fel.push('serien: spelare');
if (!(await page.locator('#ds-spelare').innerText()).includes('6–8')) fel.push('serien: singlar vunna–spelade');
await page.click('#ds-spelare [data-sort="snitt"]');
if ((await page.locator('#ds-spelare tbody tr >> nth=0 >> td >> nth=0').innerText()) !== 'Ada') fel.push('serien: sortering på snitt');
if ((await page.locator('a.lagmatch').count()) !== 1 || (await page.locator('div.lagmatch').count()) !== 1) fel.push('serien: bara Bankeryds lagmatcher ska gå att öppna');
await kontroll('4d-serien');
await page.click('a.lagmatch'); await page.waitForSelector('.delmatcher');
if ((await page.locator('.delmatcher tbody tr').count()) !== 2) fel.push('lagmatch: delmatcher');
if (!(await page.locator('.delmatcher').innerText()).includes('Ada & Okänd')) fel.push('lagmatch: dubbelns spelare');
await kontroll('4e-lagmatch');
await page.click('.delmatcher a[href="#/dsmatch/dm1"] >> nth=0'); await page.waitForSelector('.leg');
if ((await page.locator('.leg').count()) !== 3) fel.push('dsmatch: legs');
if (!(await page.locator('.jamfor').innerText()).includes(',')) fel.push('dsmatch: decimalkomma');
await kontroll('4f-dsmatch');
await page.goto(B + '#/spelare/47'); await page.waitForSelector('.nyckeltal');
await page.waitForSelector('a[href="#/serien/t_div2"]');
if (!(await page.locator('main').innerText()).includes('6–8')) fel.push('spelarsidan: distriktsserien saknas');
await page.goto(B + '#/serien/t_div3'); await page.waitForSelector('h1');
if (await page.locator('#ds-spelare').count()) fel.push('serien: division utan Bankeryd visar spelare');
// 5b. Admin: koppla namn, register, logg
await page.goto(B + '#/admin/namn/Ada'); await page.waitForSelector('#allman');
await page.selectOption('#allman', '90'); await page.click('#spara-allman');
await page.waitForSelector('.svar:text("Sparat.")');
if (!skrivningar.some((s) => s.startsWith('POST alias') && s.includes('"spelare_id":90') && s.includes('"tdid":null'))) fel.push('allmän koppling skrevs inte: ' + skrivningar.join(' | '));
await page.locator('tr[data-tdid="t_M2Vv_6390"] .valj-har').selectOption('91');
await page.click('tr[data-tdid="t_M2Vv_6390"] .spara-har'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.includes('"tdid":"t_M2Vv_6390"') && s.includes('"spelare_id":91'))) fel.push('koppling per turnering skrevs inte');
await kontroll('6b-admin-namn');
await page.goto(B + '#/admin/spelare'); await page.waitForSelector('.register');
await page.fill('tr[data-id="47"] [name=efternamn]', 'Dagsson'); await page.fill('tr[data-id="47"] [name=medlemsnummer]', '1234');
await page.click('tr[data-id="47"] .spara'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('PATCH spelare?id=eq.47') && s.includes('Dagsson') && s.includes('1234'))) fel.push('register sparades inte');
page.once('dialog', (d) => d.accept());
await page.locator('tr[data-id="91"] .ihop').selectOption('90'); await page.click('tr[data-id="91"] .sla-ihop'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('POST sla_ihop_spelare') && s.includes('"fran":91') && s.includes('"till":90'))) fel.push('slå ihop anropades inte');
await kontroll('6c-register');
await page.goto(B + '#/admin/cuper/1'); await page.waitForSelector('#c-spara');
await page.fill('[data-regel="kortset_pilar"]', '20'); await page.click('#c-spara'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('PATCH tavling?id=eq.1') && s.includes('"kortset_pilar":20'))) fel.push('cup: regler sparades inte ' + skrivningar.slice(-3).join(' | ') + ' svar: ' + await page.locator('.svar').innerText());
await page.locator('tr[data-tdid="t_Hx2V_6884"] .roll').selectOption('utesluten'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('POST tavling_val') && s.includes('utesluten'))) fel.push('cup: uteslutning skrevs inte');
await page.selectOption('#lagg-till', 't_AkVq_9412'); await page.click('#lagg'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('POST tavling_val') && s.includes('t_AkVq_9412') && s.includes('final'))) fel.push('cup: final lades inte till');
await page.selectOption('#bull-spelare', '90'); await page.click('#bull-lagg'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('POST poang_manuell') && s.includes('"spelare_id":90'))) fel.push('cup: bull lades inte till');
await kontroll('6d-admin-cup');
await page.goto(B + '#/admin/gora'); await page.waitForSelector('.uppgift');
if ((await page.locator('.uppgift').count()) !== 2) fel.push('att göra: uppgifter');
if ((await page.locator('.kontroller li').count()) < 2) fel.push('att göra: automatiska kontroller');
await page.click('[data-ansvar="administratör"]'); await page.waitForTimeout(200);
if ((await page.locator('.uppgift').count()) !== 1) fel.push('att göra: filter på ansvar');
await page.locator('.uppgift .klar-ruta').first().check(); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('PATCH uppgift?id=eq.2') && s.includes('klar'))) fel.push('att göra: bocka av');
await kontroll('6e-att-gora');
if (!(await page.locator('.kontroller').innerText()).includes('distriktsserien')) fel.push('att göra: okopplade i distriktsserien');
await page.goto(B + '#/admin/serien'); await page.waitForSelector('.ds-val');
await page.locator('tr[data-oid="o2"] .ds-val').selectOption('90'); await page.click('tr[data-oid="o2"] .ds-spara'); await page.waitForTimeout(300);
if (!skrivningar.some((s) => s.startsWith('POST ds_alias') && s.includes('"oid":"o2"') && s.includes('"spelare_id":90'))) fel.push('admin serien: koppling skrevs inte');
await kontroll('6f-admin-serien');
// Export
await page.goto(B + '#/admin/export'); await page.waitForSelector('#exportera');
const [csvFil] = await Promise.all([page.waitForEvent('download'), page.click('.csv[data-namn="spelare"]')]);
const csvText = fs.readFileSync(await csvFil.path(), 'utf8');
if (!csvText.startsWith('\uFEFFid;namn;') || !csvText.includes('47;Dag;')) fel.push('export: spelare.csv ' + csvText.slice(0, 80));
const [zipFil] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exportera')]);
fs.copyFileSync(await zipFil.path(), '/tmp/bdc-export.zip');
await page.waitForSelector('#status:text("Klart")');
await kontroll('6g-export');
// Gamla länkar #/turnering/… leder till #/tavling/…
await page.goto(B + '#/turnering/t_nRTA_1280'); await page.waitForSelector('.tavlingsflikar');
if (!page.url().includes('#/tavling/t_nRTA_1280')) fel.push('gammal länk leder inte rätt: ' + page.url());
await page.goto(B + '#/admin/logg'); await page.waitForSelector('table');
await page.goto(B + '#/admin/namn'); await page.waitForSelector('table');
// 6. Skrivbord
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(B + '#/tavling/t_nRTA_1280/statistik'); await page.waitForSelector('#stat table');
await page.screenshot({ path: '/tmp/bdc-7-turnering-dator.png', fullPage: true });

await browser.close(); server.close();
const riktiga = fel.filter((f) => !f.includes('400 (Bad Request)'));
console.log(riktiga.length ? 'FEL:\n' + riktiga.join('\n') : '0 fel');
