// Spelarsida (kopplad person eller okopplat n01-namn) med grafer och rekord, samt spelarlista
import { api, esc, fmt, heltal, spelarlank } from './lib.js?v=0.3.0';
import { tidsdiagram } from './diagram.js?v=0.3.0';

let vyLage = 'turnering';   // 'turnering' | 'match' – minns mellan spelare

export async function visaSpelarlista(app) {
  const [spelare, rader] = await Promise.all([
    api('spelare?select=id,namn,visningsnamn&aktiv=eq.true&order=namn'),
    api('v_turnering_statistik?select=spelare_id,namn,poang,pilar,placering'),
  ]);
  const sum = new Map();
  for (const r of rader) {
    if (!r.namn && !r.spelare_id) continue;
    const k = r.spelare_id ? `s${r.spelare_id}` : `n${r.namn}`;
    const s = sum.get(k) ?? { id: r.spelare_id, namn: r.namn, t: 0, p: 0, d: 0, segrar: 0 };
    s.t++; s.p += r.poang ?? 0; s.d += r.pilar ?? 0; if (r.placering === 1) s.segrar++;
    sum.set(k, s);
  }
  const namnPa = Object.fromEntries(spelare.map((s) => [s.id, s.namn]));
  const lista = [...sum.values()].map((s) => ({ ...s, namn: s.id ? namnPa[s.id] ?? s.namn : s.namn, snitt: s.d ? (3 * s.p) / s.d : null }))
    .sort((a, b) => b.t - a.t || (a.namn ?? '').localeCompare(b.namn ?? '', 'sv'));
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
  const [[p], turn, matcher, alias] = await Promise.all([
    api(`spelare?id=eq.${id}&select=*`),
    api(`v_turnering_statistik?spelare_id=eq.${id}&select=*`),
    api(`v_spelare_match?spelare_id=eq.${id}&select=*`),
    api(`alias?spelare_id=eq.${id}&select=n01_namn,tdid`),
  ]);
  if (!p) { app.innerHTML = '<p class="fel">Spelaren finns inte.</p>'; return; }
  const namnen = [...new Set(alias.map((a) => a.n01_namn))].join(', ');
  await rita(app, p.namn, turn, matcher, `Heter i n01: ${esc(namnen)}`);
}

export async function visaNamn(app, namn) {
  const q = encodeURIComponent(namn);
  const [turn, matcher] = await Promise.all([
    api(`v_turnering_statistik?namn=eq.${q}&spelare_id=is.null&select=*`),
    api(`v_spelare_match?namn=eq.${q}&spelare_id=is.null&select=*`),
  ]);
  await rita(app, namn, turn, matcher, 'Namnet är inte kopplat till en person än – statistiken gäller namnet som det står i n01 och kan gälla flera personer. Kopplingar görs av admin.');
}

const ms = (datum, tid) => (tid ? Date.parse(tid) : Date.parse(`${datum}T12:00:00Z`));
const ttypNamn = (m) => (m.ttype === 'rr' ? 'gruppspel' : m.ttype === 't3' ? 'bronsmatch' : 'slutspel');

async function rita(app, rubrik, turnRader, matcher, under) {
  const tdids = [...new Set(turnRader.map((r) => r.tdid).concat(matcher.map((m) => m.tdid)))];
  const turnInfo = tdids.length ? await api(`v_turnering?tdid=in.(${tdids.map((t) => `"${t}"`).join(',')})&select=tdid,datum,serie,omgang,titel,deltagare`) : [];
  const T = Object.fromEntries(turnInfo.map((x) => [x.tdid, x]));
  const tnamn = (tdid) => { const t = T[tdid] ?? {}; return `${t.serie ?? t.titel ?? tdid}${t.omgang ? ` ${t.omgang}` : ''}`; };

  // Per turnering: n01:s siffror kompletterade med rundstatistik ur matcherna
  const perT = turnRader.map((r) => {
    const mm = matcher.filter((m) => m.tdid === r.tdid);
    const legsV = mm.reduce((s, m) => s + Number(m.legs_vunna_pilar ?? 0), 0);
    const pilarV = mm.reduce((s, m) => s + Number(m.pilar_per_leg ?? 0) * Number(m.legs_vunna_pilar ?? 0), 0);
    const max = (k) => Math.max(0, ...mm.map((m) => Number(m[k] ?? 0))) || null;
    const min = (k) => { const v = mm.map((m) => Number(m[k])).filter(Boolean); return v.length ? Math.min(...v) : null; };
    return { ...r, t: T[r.tdid] ?? {}, pilar_per_leg: legsV ? pilarV / legsV : null, eget_basta_leg: min('basta_leg'),
      hogsta_runda: max('hogsta_runda'), hogsta_utgang: max('hogsta_utgang') };
  }).sort((a, b) => (b.t.datum ?? '').localeCompare(a.t.datum ?? ''));

  const summa = (k) => perT.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const p = summa('poang'), d = summa('pilar');

  // Rekord – varje rekord länkar dit det sattes
  const basta = (lista, k, lagre = false) => lista.filter((x) => x[k] != null && Number(x[k]) > 0)
    .sort((a, b) => (lagre ? a[k] - b[k] : b[k] - a[k]))[0];
  const mlank = (m) => `#/match/${encodeURIComponent(m.mid)}`;
  const tlank = (r) => `#/turnering/${encodeURIComponent(r.tdid)}`;
  const mtext = (m) => `mot ${esc(m.mot_namn ?? '?')}, ${esc(tnamn(m.tdid))} ${esc(m.datum ?? '')}`;
  const ttext = (r) => `${esc(tnamn(r.tdid))} ${esc(r.t.datum ?? '')}`;
  const rek = [
    ['Bästa snitt i en match', basta(matcher.filter((m) => (m.legs_vunna ?? 0) + (m.legs_forlorade ?? 0) >= 2), 'snitt'), (m) => fmt(m.snitt, 2), mlank, mtext],
    ['Bästa snitt i en turnering', basta(perT, 'snitt'), (r) => fmt(r.snitt, 2), tlank, ttext],
    ['Bästa first 9 i en match', basta(matcher, 'snitt_f9'), (m) => fmt(m.snitt_f9, 2), mlank, mtext],
    ['Bästa leg', basta(matcher, 'basta_leg', true), (m) => `${m.basta_leg} pilar`, mlank, mtext],
    ['Högsta runda', basta(matcher, 'hogsta_runda'), (m) => m.hogsta_runda, mlank, mtext],
    ['Högsta utgång', basta(matcher, 'hogsta_utgang'), (m) => m.hogsta_utgang, mlank, mtext],
    ['Flest 180:or i en turnering', basta(perT, 't180'), (r) => r.t180, tlank, ttext],
  ].filter(([, x]) => x);

  const vunnaM = matcher.filter((m) => m.vann).length;
  const nyckel = [
    ['Turneringar', perT.length],
    ['Segrar', perT.filter((r) => r.placering === 1).length],
    ['Snitt', fmt(d ? (3 * p) / d : null, 2)],
    ['Matcher', `${vunnaM}–${matcher.length}`],
    ['180:or', heltal(summa('t180'))],
  ];

  app.innerHTML = `
    <p><a href="#/spelare" class="tillbaka">← Spelare</a></p>
    <h1>${esc(rubrik)}</h1>
    <p class="muted liten">${under}</p>
    <div class="nyckeltal">${nyckel.map(([n, v]) => `<div class="kort"><span class="muted">${n}</span><b>${v}</b></div>`).join('')}</div>
    <h2>Rekord</h2>
    <div class="rekord">${rek.map(([n, x, v, lank, txt]) => `<a class="kort rekordkort" href="${lank(x)}">
      <span class="muted">${n}</span><b>${v(x)}</b><small>${txt(x)}</small></a>`).join('')}</div>
    <h2>Utveckling</h2>
    <div class="filter" role="group" aria-label="Visa per">
      <button type="button" class="chip" data-lage="turnering">Per turnering</button>
      <button type="button" class="chip" data-lage="match">Per match</button>
    </div>
    <div id="grafer"></div>
    <p class="muted liten">Pilar per leg och bästa leg räknar bara legs som vunnits med pilar – inte legs avgjorda med närmast bull (middle for diddle). Peka eller tryck på en punkt för att se värdet; klicka (eller tryck igen) för att öppna matchen eller turneringen.</p>
    <h2>Turneringar</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Datum</th><th>Turnering</th><th>Plac</th><th>Matcher</th><th>Snitt</th><th>F9</th><th>180</th><th>HO</th></tr></thead>
      <tbody>${perT.map((r) => `<tr>
        <td class="fast">${esc(r.t.datum ?? '')}</td>
        <td><a href="${tlank(r)}">${esc(tnamn(r.tdid))}</a></td>
        <td>${r.placering ? `${r.placering}/${r.t.deltagare ?? ''}` : '–'}</td>
        <td>${r.vunna_matcher}–${r.matcher}</td><td>${fmt(r.snitt, 2)}</td><td>${fmt(r.snitt_f9, 2)}</td>
        <td>${r.t180 || ''}</td><td>${r.high_out ?? ''}</td></tr>`).join('')}</tbody>
    </table></div>`;

  const ritaGrafer = () => {
    app.querySelectorAll('[data-lage]').forEach((b) => b.classList.toggle('vald', b.dataset.lage === vyLage));
    const perMatch = vyLage === 'match';
    const tal = (v) => (v === null || v === undefined ? null : Number(v));
    const punkt = (k) => (perMatch
      ? matcher.map((m) => ({ x: ms(m.datum, m.starttid), y: tal(m[k]), datum: m.datum ?? '',
          text: `${m.vann ? 'Vinst' : 'Förlust'} ${m.legs_vunna}–${m.legs_forlorade} mot ${m.mot_namn ?? '?'} · ${tnamn(m.tdid)}, ${ttypNamn(m)}`, lank: mlank(m) }))
      : perT.map((r) => ({ x: ms(r.t.datum), y: tal(r[k]), datum: r.t.datum ?? '',
          text: `${tnamn(r.tdid)} · plats ${r.placering ?? '–'}`, lank: tlank(r) })));
    const pn = perMatch ? 'per match' : 'per turnering';
    const grafer = [
      ['3-pilssnitt', punkt('snitt'), { decimaler: 2 }],
      ['Snitt första 9 pilarna', punkt('snitt_f9'), { decimaler: 2 }],
      ['Pilar per vunnet leg (snitt)', punkt('pilar_per_leg'), { decimaler: 1, enhet: 'pilar', lagreArBattre: true }],
      ['Bästa leg', punkt(perMatch ? 'basta_leg' : 'eget_basta_leg'), { decimaler: 0, enhet: 'pilar', lagreArBattre: true }],
      ['Högsta runda (tre pilar)', punkt('hogsta_runda'), { decimaler: 0 }],
      ['Högsta utgång', punkt('hogsta_utgang'), { decimaler: 0 }],
    ];
    document.getElementById('grafer').innerHTML = `<div class="grafer">${grafer.map(([titel, pkt, val]) =>
      `<div class="kort graf"><h3>${titel}</h3>${tidsdiagram(pkt, { ...val, punktnamn: pn })}</div>`).join('')}</div>`;
  };
  app.querySelector('[aria-label="Visa per"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lage]'); if (!b) return;
    vyLage = b.dataset.lage; ritaGrafer();
  });
  ritaGrafer();
}
