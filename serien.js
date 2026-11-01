// Distriktsserien (v0.5): serietabeller för hela divisionerna, lagmatcher och Bankeryds spelare.
// Delmatcher (singlar/dubblar) med legs finns bara för Bankeryds lag (beslut Henrik 2026-10-31).
import { api, esc, fmt, spelarlank } from './lib.js?v=0.10.0';
import { rakna, statistikHtml, legsHtml, protokollSida, koppla } from './protokoll.js?v=0.10.0';

const lagNamn = (namn, bankeryd) => (bankeryd ? `<b class="bankeryd">${esc(namn)}</b>` : esc(namn));
const resultat = (a, b) => (a == null || b == null ? '–' : `${a}–${b}`);
// Spelarna på en sida: länk till kopplad person, annars bara namnet
const spelarna = (lista) => (lista ?? []).map((p) => (p.spelare_id ? spelarlank(p.namn, p.spelare_id) : esc(p.namn))).join(' & ');
let spSort = { k: 'matcher', dir: -1 };

export async function visaSerien(app, tdid) {
  const [ligor, divisioner] = await Promise.all([
    api('tavling?typ=eq.distriktsserie&select=id,namn,kommentar&order=fran.desc.nullslast'),
    api('ds_division?select=tdid,tavling_id,titel,division,status,hamtad&order=division'),
  ]);
  if (!divisioner.length) {
    app.innerHTML = `<h1>Distriktsserien</h1><p class="muted">Ingen data hämtad än. Den hämtas automatiskt torsdag och söndag kl. 23:00.</p>`;
    return;
  }
  const lag = await api('ds_lag?bankeryd=eq.true&select=tdid,tpid,namn');
  const medBankeryd = new Set(lag.map((l) => l.tdid));
  const vald = divisioner.find((d) => d.tdid === tdid) ?? divisioner.find((d) => medBankeryd.has(d.tdid)) ?? divisioner[0];
  const liga = ligor.find((l) => l.id === vald.tavling_id);
  const q = encodeURIComponent(vald.tdid);
  const [tabell, lagmatcher, sp] = await Promise.all([
    api(`v_ds_tabell?tdid=eq.${q}&select=*&order=placering`),
    api(`v_ds_lagmatch?tdid=eq.${q}&select=*&order=datum.desc.nullslast`),
    api(`v_ds_spelare?tdid=eq.${q}&select=*`),
  ]);
  const vartLag = lag.filter((l) => l.tdid === vald.tdid).map((l) => l.namn).join(' och ');
  const chips = divisioner.filter((d) => d.tavling_id === vald.tavling_id).map((d) => `<a class="chip${d.tdid === vald.tdid ? ' vald' : ''}" href="#/serien/${encodeURIComponent(d.tdid)}">${esc(d.division)}${medBankeryd.has(d.tdid) ? ' ★' : ''}</a>`).join('');

  const kol = [
    ['namn', 'Spelare', 'Spelare', (r) => (r.spelare_id ? spelarlank(r.namn, r.spelare_id) : esc(r.namn))],
    ['singlar', 'Singel', 'Vunna–spelade singlar', (r) => `${r.singlar_vunna}–${r.singlar}`],
    ['dubblar', 'Dubbel', 'Vunna–spelade dubblar', (r) => `${r.dubblar_vunna}–${r.dubblar}`],
    ['legs', 'Legs', 'Vunna–spelade legs', (r) => `${r.vunna_legs}–${r.legs}`],
    ['snitt', 'Snitt', '3-pilssnitt', (r) => fmt(r.snitt, 2)],
    ['snitt_f9', 'F9', 'Snitt första 9 pilarna', (r) => fmt(r.snitt_f9, 2)],
    ['t100', '100+', '100–139', (r) => r.t100 || ''],
    ['t140', '140+', '140–169', (r) => r.t140 || ''],
    ['t180', '180', '180', (r) => r.t180 || ''],
    ['high_out', 'HO', 'Högsta utgång', (r) => r.high_out ?? ''],
    ['basta_leg', 'BL', 'Bästa leg (pilar)', (r) => r.basta_leg ?? ''],
  ];
  const ritaSpelare = () => {
    const { k, dir } = spSort;
    const v = (r) => (k === 'singlar' ? r.singlar_vunna * 100 + r.singlar : k === 'dubblar' ? r.dubblar_vunna * 100 + r.dubblar
      : k === 'legs' ? r.vunna_legs * 1000 + r.legs : k === 'matcher' ? r.vunna_matcher * 100 + r.matcher : Number(r[k] ?? (k === 'basta_leg' ? 999 : -1)));
    const lista = [...sp].sort((a, b) => (k === 'namn' ? dir * a.namn.localeCompare(b.namn, 'sv') : dir * (v(a) - v(b))));
    const lagen = [...new Set(sp.map((r) => r.lag))];
    document.getElementById('ds-spelare').innerHTML = lagen.map((ln) => `<h3>${esc(ln)}</h3><div class="rulla"><table class="tabell">
      <thead><tr>${kol.map(([n, rub, f], i) => `<th${i ? '' : ' class="fast"'}><button type="button" data-sort="${n}" title="${esc(f)}" class="${n === k ? 'sorterad' : ''}">${rub}</button></th>`).join('')}</tr></thead>
      <tbody>${lista.filter((r) => r.lag === ln).map((r) => `<tr>${kol.map(([, , , f], i) => `<td${i ? '' : ' class="fast"'}>${f(r)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`).join('');
  };

  app.innerHTML = `
    <h1>Distriktsserien</h1>
    <p class="muted">${esc(liga?.namn ?? '')}${vartLag ? ` · ${esc(vartLag)} spelar i ${esc(vald.division)}` : ''}. ★ = division med Bankeryd. Hämtas automatiskt torsdag och söndag kl. 23:00.</p>
    <div class="filter" role="navigation" aria-label="Divisioner">${chips}</div>
    <h2>Serietabell ${esc(vald.division)}</h2>
    <div class="rulla"><table class="tabell serietabell">
      <thead><tr><th>#</th><th class="fast">Lag</th><th title="Spelade lagmatcher">S</th><th title="Vunna">V</th><th title="Oavgjorda">O</th><th title="Förlorade">F</th><th title="Vunna minus förlorade delmatcher">+/−</th><th title="Poäng">P</th></tr></thead>
      <tbody>${tabell.map((r) => `<tr class="${r.bankeryd ? 'vart' : ''}"><td>${r.placering}</td><td class="fast">${lagNamn(r.lag, r.bankeryd)}</td>
        <td>${r.spelade}</td><td>${r.vunna}</td><td>${r.oavgjorda}</td><td>${r.forlorade}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.poang}</b></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted liten">Som n01 räknar: 2 poäng för vunnen lagmatch, 1 för oavgjord. +/− = vunna minus förlorade singlar och dubblar.</p>
    ${sp.length ? `<h2>Bankeryds spelare</h2><div id="ds-spelare"></div>
      <p class="muted liten">n01:s statistik för singlar och dubblar tillsammans. Tryck på en rubrik för att sortera.</p>` : ''}
    <h2>Lagmatcher</h2>
    <div class="lagmatcher">${lagmatcher.map((m) => {
      const vart = m.bankeryd_a || m.bankeryd_b;
      const inre = `<span class="muted liten">${esc(m.datum ?? '')}</span>
        <span class="${m.vunna_a > m.vunna_b ? 'vinst' : ''}">${lagNamn(m.namn_a, m.bankeryd_a)}</span>
        <b class="resultat">${resultat(m.vunna_a, m.vunna_b)}</b>
        <span class="${m.vunna_b > m.vunna_a ? 'vinst' : ''}">${lagNamn(m.namn_b, m.bankeryd_b)}</span>`;
      return vart && m.delmatcher ? `<a class="kort lagmatch" href="#/lagmatch/${encodeURIComponent(m.tdid)}/${encodeURIComponent(m.nyckel)}">${inre}</a>`
        : `<div class="kort lagmatch">${inre}</div>`;
    }).join('') || '<p class="muted">Inga lagmatcher spelade än.</p>'}</div>
    <p class="muted liten">Tryck på Bankeryds lagmatcher för att se alla singlar och dubblar.</p>`;
  if (sp.length) {
    app.querySelector('#ds-spelare').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      const n = b.dataset.sort;
      spSort = spSort.k === n ? { k: n, dir: -spSort.dir } : { k: n, dir: n === 'namn' || n === 'basta_leg' ? 1 : -1 };
      ritaSpelare();
    });
    ritaSpelare();
  }
}

export async function visaLagmatch(app, tdid, nyckel) {
  const [[m], del] = await Promise.all([
    api(`v_ds_lagmatch?tdid=eq.${encodeURIComponent(tdid)}&nyckel=eq.${encodeURIComponent(nyckel)}&select=*`),
    api(`v_ds_match?tdid=eq.${encodeURIComponent(tdid)}&nyckel=eq.${encodeURIComponent(nyckel)}&select=*&order=nr`),
  ]);
  if (!m) { app.innerHTML = '<p class="fel">Lagmatchen finns inte.</p>'; return; }
  app.innerHTML = `
    <p><a href="#/serien/${encodeURIComponent(tdid)}" class="tillbaka">← ${esc(m.division)}</a></p>
    <h1>Lagmatch</h1>
    <p class="muted">${esc(m.datum ?? '')} · ${esc(m.division)}</p>
    <div class="kort matchhuvud">
      <span class="${m.vunna_a > m.vunna_b ? 'vinst' : ''}">${lagNamn(m.namn_a, m.bankeryd_a)}</span>
      <b class="resultat stor">${resultat(m.vunna_a, m.vunna_b)}</b>
      <span class="${m.vunna_b > m.vunna_a ? 'vinst' : ''}">${lagNamn(m.namn_b, m.bankeryd_b)}</span>
    </div>
    <div class="rulla"><table class="tabell delmatcher">
      <thead><tr><th class="fast">Match</th><th>${esc(m.namn_a)}</th><th>Legs</th><th>${esc(m.namn_b)}</th><th>Snitt</th></tr></thead>
      <tbody>${del.map((d) => `<tr>
        <td class="fast"><a href="#/dsmatch/${encodeURIComponent(d.mid)}">${esc((d.delmatch ?? '').replace(/\s*\(.*$/, ''))}</a></td>
        <td class="${d.legs_a > d.legs_b ? 'vinst' : ''}">${spelarna(d.spelare_a)}</td>
        <td><a href="#/dsmatch/${encodeURIComponent(d.mid)}"><b>${d.legs_a}–${d.legs_b ?? 0}</b></a>${d.klar ? '' : ' <span class="etikett">pågår</span>'}</td>
        <td class="${d.legs_b > d.legs_a ? 'vinst' : ''}">${spelarna(d.spelare_b)}</td>
        <td class="liten">${fmt(d.snitt_a, 2)} – ${fmt(d.snitt_b, 2)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted liten">Singlar och dubblar, bäst av ${del[0]?.legs_for_vinst ? del[0].legs_for_vinst * 2 - 1 : 3} legs. Tryck på en match för att se varje leg runda för runda.</p>`;
}

export async function visaDsMatch(app, mid) {
  const q = encodeURIComponent(mid);
  const [[d], legs, kast] = await Promise.all([
    api(`v_ds_match?mid=eq.${q}&select=*`),
    api(`ds_leg?mid=eq.${q}&select=nr,forst,vinnare,mfd&order=nr`),
    api(`ds_kast?mid=eq.${q}&select=leg_nr,sida,runda,poang,kvar,pilar,utgang&order=leg_nr,runda,sida`),
  ]);
  if (!d) { app.innerHTML = '<p class="fel">Matchen finns inte.</p>'; return; }
  const [lm] = await api(`v_ds_lagmatch?tdid=eq.${encodeURIComponent(d.tdid)}&nyckel=eq.${encodeURIComponent(d.nyckel)}&select=division,datum,namn_a,namn_b`);
  const sidaNamn = (s) => (s === 0 ? (d.spelare_a ?? []).map((p) => p.namn).join(' & ') || d.namn_a : (d.spelare_b ?? []).map((p) => p.namn).join(' & ') || d.namn_b);
  app.innerHTML = `
    <p><a href="#/lagmatch/${encodeURIComponent(d.tdid)}/${encodeURIComponent(d.nyckel)}" class="tillbaka">← ${esc(lm?.namn_a ?? '')} – ${esc(lm?.namn_b ?? '')}</a></p>
    <h1>${esc((d.delmatch ?? 'Match').replace(/\s*\(.*$/, ''))}</h1>
    <p class="muted">${esc(lm?.datum ?? '')} · ${esc(lm?.division ?? '')} · ${lagNamn(d.namn_a, d.bankeryd_a)} mot ${lagNamn(d.namn_b, d.bankeryd_b)}${d.klar ? '' : ' · <span class="etikett">pågår</span>'}</p>
    <div class="kort matchhuvud">
      <span class="${d.legs_a > d.legs_b ? 'vinst' : ''}">${spelarna(d.spelare_a) || esc(d.namn_a)}</span>
      <b class="resultat stor">${d.legs_a}–${d.legs_b ?? 0}</b>
      <span class="${d.legs_b > d.legs_a ? 'vinst' : ''}">${spelarna(d.spelare_b) || esc(d.namn_b)}</span>
    </div>
    ${protokollSida(statistikHtml(sidaNamn(0), sidaNamn(1), rakna(kast, legs, 0, d.legs_a), rakna(kast, legs, 1, d.legs_b)),
      legsHtml(legs, kast, sidaNamn), d.dubbel ? ' I dubbel kastar spelarna varannan runda.' : '')}`;
  koppla(app);
}
