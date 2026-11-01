// Cuper: lista och poängtabell per cup med klubbens poängregler
import { api, esc, spelarlank } from './lib.js?v=0.9.3';

const KOL = [
  // nyckel, rubrik, förklaring, regel som avgör om kolumnen visas
  ['deltagande', 'Delt', 'Deltagande', 'deltagande'],
  ['finalvinst', 'FV', 'Finalvinst', 'finalvinst'],
  ['finalforlust', 'FF', 'Finalförlust', 'finalforlust'],
  ['semifinal', 'SF', 'Semifinalplats', 'semifinal'],
  ['vunna_matcher', 'Vunna', 'Vunna matcher', 'vunnen_match'],
  ['hog_utgang', 'HÖ', 'Hög utgång', 'hog_utgang'],
  ['bull', 'Bull', 'Bull-utgång (inmatad av admin)', 'bull'],
  ['t171', '171', '171-kast', 't171'],
  ['t180', '180', '180-kast', 't180'],
  ['kortset', 'KS', 'Kortset', 'kortset'],
];
const period = (t) => `${t.fran ?? '…'} – ${t.till ?? '…'}`;
let sortering = { k: 'summa', dir: -1 };

export async function visaCuper(app) {
  const [cuper, turn, poang] = await Promise.all([
    api('tavling?typ=eq.klubbcup&select=*&order=fran.desc.nullslast'),
    api('v_tavling_turnering?select=tavling_id,roll,datum'),
    api('v_cup_poang?select=tavling_id,visas,summa'),
  ]);
  const kort = cuper.map((c) => {
    const omg = turn.filter((t) => t.tavling_id === c.id && t.roll === 'omgang');
    const topp = poang.filter((p) => p.tavling_id === c.id).sort((a, b) => b.summa - a.summa).slice(0, 3);
    const senast = omg.map((t) => t.datum).sort().at(-1);
    return `<a class="kort cupkort" href="#/cup/${c.id}">
      <h3>${esc(c.namn)}</h3>
      <span class="muted liten">${period(c)} · ${omg.length} omgångar${senast ? ` · senast ${esc(senast)}` : ''}</span>
      ${topp.length ? `<ol>${topp.map((p) => `<li>${esc(p.visas)} <b>${p.summa}</b></li>`).join('')}</ol>` : '<p class="muted liten">Inga omgångar än.</p>'}
    </a>`;
  }).join('');
  app.innerHTML = `
    <h1>Cuper</h1>
    <p class="muted">Klubbens cuper och serier med poängtabeller enligt klubbens poängregler. Räknas automatiskt ur n01 efter varje omgång.</p>
    <div class="cuplista">${kort || '<p class="muted">Inga cuper ännu.</p>'}</div>`;
}

export async function visaCup(app, id) {
  const [[c], rader, turn] = await Promise.all([
    api(`tavling?id=eq.${id}&select=*`),
    api(`v_cup_poang?tavling_id=eq.${id}&select=*`),
    api(`v_tavling_turnering?tavling_id=eq.${id}&select=*&order=datum`),
  ]);
  if (!c) { app.innerHTML = '<p class="fel">Cupen finns inte.</p>'; return; }
  const r = c.regler ?? {};
  const kol = KOL.filter(([, , , regel]) => Number(r[regel] ?? 0) > 0);
  const omg = turn.filter((t) => t.roll === 'omgang'), fin = turn.filter((t) => t.roll === 'final');
  const regeltext = [
    ['deltagande', 'deltagande'], ['finalvinst', 'finalvinst'], ['finalforlust', 'finalförlust'], ['semifinal', 'semifinalplats'],
    ['vunnen_match', 'vunnen match'], ['hog_utgang', `hög utgång (${r.hog_utgang_fran ?? 100}+)`], ['bull', 'bull-utgång'],
    ['t171', '171-kast'], ['t180', '180-kast'], ['kortset', `kortset (≤ ${r.kortset_pilar ?? 21} pilar)`],
  ].filter(([k]) => Number(r[k] ?? 0) > 0).map(([k, n]) => `${n} ${r[k]}`).join(' · ');

  const rita = () => {
    const { k, dir } = sortering;
    const lista = [...rader].sort((a, b) => (k === 'visas'
      ? dir * String(a.visas).localeCompare(String(b.visas), 'sv')
      : dir * ((a[k] ?? 0) - (b[k] ?? 0))) || b.summa - a.summa);
    // Placering efter summa (delad placering vid lika)
    const efterSumma = [...rader].sort((a, b) => b.summa - a.summa);
    const plats = (x) => efterSumma.findIndex((y) => y.summa === x.summa) + 1;
    document.getElementById('poang').innerHTML = `<table class="tabell poangtabell">
      <thead><tr><th>#</th><th class="fast"><button type="button" data-sort="visas">Spelare</button></th>
        ${kol.map(([n, rub, f]) => `<th><button type="button" data-sort="${n}" title="${esc(f)}" class="${n === k ? 'sorterad' : ''}">${rub}</button></th>`).join('')}
        <th><button type="button" data-sort="summa" class="${k === 'summa' ? 'sorterad' : ''}">Poäng</button></th></tr></thead>
      <tbody>${lista.map((x) => `<tr class="${c.kvalgrans && x.summa >= c.kvalgrans ? 'kval' : ''}">
        <td>${plats(x)}</td><td class="fast">${x.spelare_id ? spelarlank(x.visas, x.spelare_id) : spelarlank(x.n01_namn, null)}</td>
        ${kol.map(([n]) => `<td>${x[n] || ''}</td>`).join('')}<td><b>${x.summa}</b></td></tr>`).join('')}</tbody>
    </table>`;
  };

  app.innerHTML = `
    <p><a href="#/cuper" class="tillbaka">← Cuper</a></p>
    <h1>${esc(c.namn)}</h1>
    <p class="muted">${period(c)} · ${omg.length} omgångar${fin.length ? ' + finalspel' : ''}${c.kvalgrans ? ` · <span class="kvalnyckel"></span> kvalificerad till finalspelet (minst ${c.kvalgrans} poäng)` : ''}</p>
    <p class="muted liten">Poäng: ${esc(regeltext)}.${c.kommentar ? ` ${esc(c.kommentar)}` : ''}</p>
    <div class="rulla" id="poang"></div>
    <p class="muted liten">Tryck på en rubrik för att sortera. Bull-utgång går inte att läsa ur n01 och matas in av admin.</p>
    <h2>Omgångar</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Datum</th><th>Tävling</th><th>Del</th></tr></thead>
      <tbody>${turn.map((t) => `<tr><td class="fast">${esc(t.datum ?? '')}</td>
        <td><a href="#/tavling/${encodeURIComponent(t.tdid)}">${esc(t.serie ?? t.titel)}${t.omgang ? ` ${t.omgang}` : ''}</a></td>
        <td>${t.roll === 'final' ? 'Finalspel' : 'Omgång'}</td></tr>`).join('')}</tbody></table></div>`;
  app.querySelector('#poang').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const n = b.dataset.sort;
    sortering = sortering.k === n ? { k: n, dir: -sortering.dir } : { k: n, dir: n === 'visas' ? 1 : -1 };
    rita();
  });
  rita();
}
