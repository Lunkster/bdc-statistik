// Spelarsida (kopplad person eller okopplat n01-namn) med grafer och rekord, samt spelarlista
import { api, esc, fmt, heltal, spelarlank } from './lib.js?v=0.5.0';
import { tidsdiagram } from './diagram.js?v=0.5.0';

let vyLage = 'turnering';   // 'turnering' | 'match' – minns mellan spelare

let listSort = { k: 't', dir: -1 };   // kolumn och riktning (-1 = störst först) – minns mellan besök

export async function visaSpelarlista(app) {
  const [spelare, rader] = await Promise.all([
    api('spelare?select=id,namn,visningsnamn&aktiv=eq.true&order=namn'),
    api('v_turnering_statistik?select=spelare_id,namn,poang,pilar,placering,t180,f9_poang,f9_pilar,matcher,vunna_matcher'),
  ]);
  const sum = new Map();
  for (const r of rader) {
    if (!r.namn && !r.spelare_id) continue;
    const k = r.spelare_id ? `s${r.spelare_id}` : `n${r.namn}`;
    const s = sum.get(k) ?? { id: r.spelare_id, namn: r.namn, t: 0, p: 0, d: 0, f9p: 0, f9d: 0, t180: 0, m: 0, mv: 0, segrar: 0 };
    s.t++; s.p += r.poang ?? 0; s.d += r.pilar ?? 0; s.f9p += r.f9_poang ?? 0; s.f9d += r.f9_pilar ?? 0;
    s.t180 += r.t180 ?? 0; s.m += r.matcher ?? 0; s.mv += r.vunna_matcher ?? 0; if (r.placering === 1) s.segrar++;
    sum.set(k, s);
  }
  const namnPa = Object.fromEntries(spelare.map((s) => [s.id, s.namn]));
  const lista = [...sum.values()].map((s) => ({ ...s, namn: s.id ? namnPa[s.id] ?? s.namn : s.namn,
    snitt: s.d ? (3 * s.p) / s.d : null, f9: s.f9d ? (3 * s.f9p) / s.f9d : null, vinst: s.m ? s.mv / s.m : null }));
  const okopplade = lista.filter((s) => !s.id).length;
  const kol = [
    ['namn', 'Spelare', 1], ['t', 'Turneringar', -1], ['segrar', 'Segrar', -1], ['vinst', 'Vunna matcher', -1],
    ['snitt', 'Snitt', -1], ['f9', 'First 9', -1], ['t180', '180', -1],
  ];
  const rita = () => {
    const { k, dir } = listSort;
    const sorterad = [...lista].sort((a, b) => {
      if (k === 'namn') return dir * (a.namn ?? '').localeCompare(b.namn ?? '', 'sv');
      const va = a[k], vb = b[k];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return dir * (va - vb) || b.t - a.t;
    });
    document.getElementById('spelarlista').innerHTML = `<table class="tabell">
      <thead><tr>${kol.map(([n, r], i) => `<th${i ? '' : ' class="fast"'}><button type="button" data-sort="${n}" class="${n === k ? 'sorterad' : ''}">${r}${n === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${sorterad.map((s) => `<tr><td class="fast">${spelarlank(s.namn, s.id)}</td><td>${s.t}</td><td>${s.segrar || ''}</td>
        <td>${s.m ? `${s.mv}–${s.m}` : '–'}</td><td>${fmt(s.snitt, 2)}</td><td>${fmt(s.f9, 2)}</td><td>${s.t180 || ''}</td></tr>`).join('')}</tbody>
    </table>`;
  };
  app.innerHTML = `
    <h1>Spelare</h1>
    <p class="muted">${lista.length - okopplade} spelare i registret${okopplade ? ` och ${okopplade} namn från n01 som inte är kopplade till en person än (kursiva)` : ''}. Tryck på en rubrik för att sortera.</p>
    <div class="rulla" id="spelarlista"></div>`;
  app.querySelector('#spelarlista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const n = b.dataset.sort, std = kol.find((x) => x[0] === n)[2];
    listSort = listSort.k === n ? { k: n, dir: -listSort.dir } : { k: n, dir: std };
    rita();
  });
  rita();
}

export async function visaSpelare(app, id) {
  const [[p], turn, matcher, alias] = await Promise.all([
    api(`spelare?id=eq.${id}&select=*`),
    api(`v_turnering_statistik?spelare_id=eq.${id}&select=*`),
    api(`v_spelare_match?spelare_id=eq.${id}&select=*`),
    api(`alias?spelare_id=eq.${id}&select=n01_namn,tdid`),
  ]);
  const ds = await api(`v_ds_spelare?spelare_id=eq.${id}&select=*`).catch(() => []);
  if (!p) { app.innerHTML = '<p class="fel">Spelaren finns inte.</p>'; return; }
  const namnen = [...new Set(alias.map((a) => a.n01_namn))].join(', ');
  await rita(app, p.namn, turn, matcher, `Heter i n01: ${esc(namnen)}`, dsHtml(ds));
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

// Distriktsserien på spelarsidan: en rad per division (n01:s siffror, singlar och dubblar)
function dsHtml(rader) {
  if (!rader.length) return '';
  return `<h2>Distriktsserien</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Lag</th><th>Singel</th><th>Dubbel</th><th>Legs</th><th>Snitt</th><th>F9</th><th>180</th><th>HO</th><th>BL</th></tr></thead>
      <tbody>${rader.map((r) => `<tr><td class="fast"><a href="#/serien/${encodeURIComponent(r.tdid)}">${esc(r.lag)} (${esc(r.division)})</a></td>
        <td>${r.singlar_vunna}–${r.singlar}</td><td>${r.dubblar_vunna}–${r.dubblar}</td><td>${r.vunna_legs}–${r.legs}</td>
        <td>${fmt(r.snitt, 2)}</td><td>${fmt(r.snitt_f9, 2)}</td><td>${r.t180 || ''}</td><td>${r.high_out ?? ''}</td><td>${r.basta_leg ?? ''}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted liten">Ingår inte i statistiken ovan, som gäller klubbens turneringar.</p>`;
}

async function rita(app, rubrik, turnRader, matcher, under, extra = '') {
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
    </table></div>${extra}`;

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
