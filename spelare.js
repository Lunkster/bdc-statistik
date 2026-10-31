// Spelarsida (kopplad person eller okopplat n01-namn) och spelarlista
import { api, esc, fmt, heltal, spelarlank } from './lib.js?v=0.1.0';

export async function visaSpelarlista(app) {
  const [spelare, rader] = await Promise.all([
    api('spelare?select=id,namn,visningsnamn&aktiv=eq.true&order=namn'),
    api('v_turnering_statistik?select=spelare_id,namn,poang,pilar,placering'),
  ]);
  const sum = new Map();
  for (const r of rader) {
    const k = r.spelare_id ? `s${r.spelare_id}` : `n${r.namn}`;
    const s = sum.get(k) ?? { id: r.spelare_id, namn: r.namn, t: 0, p: 0, d: 0, segrar: 0 };
    s.t++; s.p += r.poang ?? 0; s.d += r.pilar ?? 0; if (r.placering === 1) s.segrar++;
    sum.set(k, s);
  }
  const namnPa = Object.fromEntries(spelare.map((s) => [s.id, s.namn]));
  const lista = [...sum.values()].map((s) => ({ ...s, namn: s.id ? namnPa[s.id] ?? s.namn : s.namn, snitt: s.d ? (3 * s.p) / s.d : null }))
    .sort((a, b) => b.t - a.t || a.namn.localeCompare(b.namn, 'sv'));
  const okopplade = lista.filter((s) => !s.id).length;
  app.innerHTML = `
    <h1>Spelare</h1>
    <p class="muted">${lista.length - okopplade} spelare i registret${okopplade ? ` och ${okopplade} namn från n01 som inte är kopplade till en person än (kursiva)` : ''}.</p>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Spelare</th><th>Turneringar</th><th>Segrar</th><th>Snitt</th></tr></thead>
      <tbody>${lista.map((s) => `<tr><td class="fast">${spelarlank(s.namn, s.id)}</td><td>${s.t}</td><td>${s.segrar || ''}</td><td>${fmt(s.snitt, 2)}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

export async function visaSpelare(app, id) {
  const [[p], rader, alias] = await Promise.all([
    api(`spelare?id=eq.${id}&select=*`),
    api(`v_turnering_statistik?spelare_id=eq.${id}&select=*`),
    api(`alias?spelare_id=eq.${id}&select=n01_namn,tdid`),
  ]);
  if (!p) { app.innerHTML = '<p class="fel">Spelaren finns inte.</p>'; return; }
  const namnen = [...new Set(alias.map((a) => a.n01_namn))].join(', ');
  await rita(app, p.namn, rader, `Heter i n01: ${esc(namnen)}`);
}

export async function visaNamn(app, namn) {
  const rader = (await api(`v_turnering_statistik?namn=eq.${encodeURIComponent(namn)}&select=*`)).filter((r) => !r.spelare_id);
  await rita(app, namn, rader, 'Namnet är inte kopplat till en person än – statistiken gäller namnet som det står i n01. Kopplingar görs av admin.');
}

async function rita(app, rubrik, rader, under) {
  const tdids = [...new Set(rader.map((r) => r.tdid))];
  const turn = tdids.length ? await api(`v_turnering?tdid=in.(${tdids.map((t) => `"${t}"`).join(',')})&select=tdid,datum,serie,omgang,titel,deltagare`) : [];
  const t = Object.fromEntries(turn.map((x) => [x.tdid, x]));
  const lista = rader.map((r) => ({ ...r, t: t[r.tdid] ?? {} })).sort((a, b) => (b.t.datum ?? '').localeCompare(a.t.datum ?? ''));
  const summa = (k) => lista.reduce((s, r) => s + (r[k] ?? 0), 0);
  const p = summa('poang'), d = summa('pilar');
  const max = (k) => Math.max(0, ...lista.map((r) => r[k] ?? 0)) || null;
  const min = (k) => { const v = lista.map((r) => r[k]).filter(Boolean); return v.length ? Math.min(...v) : null; };
  const nyckel = [
    ['Turneringar', lista.length],
    ['Segrar', lista.filter((r) => r.placering === 1).length],
    ['Snitt', fmt(d ? (3 * p) / d : null, 2)],
    ['Matcher', `${summa('vunna_matcher')}–${summa('matcher')}`],
    ['180:or', heltal(summa('t180'))],
    ['Högsta utgång', max('high_out') ?? '–'],
    ['Bästa leg', min('basta_leg') ? `${min('basta_leg')} pilar` : '–'],
  ];
  app.innerHTML = `
    <p><a href="#/spelare" class="tillbaka">← Spelare</a></p>
    <h1>${esc(rubrik)}</h1>
    <p class="muted liten">${under}</p>
    <div class="nyckeltal">${nyckel.map(([n, v]) => `<div class="kort"><span class="muted">${n}</span><b>${v}</b></div>`).join('')}</div>
    <p class="muted liten">Mer statistik per spelare (utveckling, inbördes möten) kommer i nästa version.</p>
    <h2>Turneringar</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Datum</th><th>Turnering</th><th>Plac</th><th>Matcher</th><th>Snitt</th><th>F9</th><th>180</th><th>HO</th></tr></thead>
      <tbody>${lista.map((r) => `<tr>
        <td class="fast">${esc(r.t.datum ?? '')}</td>
        <td><a href="#/turnering/${encodeURIComponent(r.tdid)}">${esc(r.t.serie ?? r.t.titel ?? r.tdid)}${r.t.omgang ? ` ${r.t.omgang}` : ''}</a></td>
        <td>${r.placering ? `${r.placering}/${r.t.deltagare ?? ''}` : '–'}</td>
        <td>${r.vunna_matcher}–${r.matcher}</td><td>${fmt(r.snitt, 2)}</td><td>${fmt(r.snitt_f9, 2)}</td>
        <td>${r.t180 || ''}</td><td>${r.high_out ?? ''}</td></tr>`).join('')}</tbody>
    </table></div>`;
}
