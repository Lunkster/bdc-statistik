// Tävlingssida: samma statistik som n01:s statistiksida, grupper, slutspel och matcherna i tidsordning
import { api, esc, fmt, heltal, spelarlank, datumTid } from './lib.js?v=0.9.9';
import { checkoutUppskattad, besokUrN01 } from './utgang.js?v=0.9.9';

const pct = (v) => (v == null ? '–' : `${fmt(v, 1)} %`);
const OMG = { '-1': 'F', '-2': 'SF', '-3': 'KF', '-4': 'ÅF' };
const KOLUMNER = [
  // nyckel, rubrik, förklaring, sortering (1 = högst först, -1 = lägst först), format, 'd' = bara under Detaljer i mobilen
  ['placering', 'Plac', 'Placering', -1, (v) => v ?? '–'],
  ['matcher_vs', 'Matcher', 'Vunna – spelade matcher', 1, null],
  ['legs_vs', 'Legs', 'Vunna – spelade legs', 1, null],
  ['snitt', 'Snitt', '3-pilssnitt', 1, (v) => fmt(v, 2)],
  ['snitt_f9', 'F9', 'Snitt första 9 pilarna', 1, (v) => fmt(v, 2)],
  ['t100', '100+', 'Rundor på 100–139', 1, heltal],
  ['t140', '140+', 'Rundor på 140–169', 1, heltal],
  ['t170', '170+', 'Rundor på 170–179', 1, heltal],
  ['t180', '180', 'Rundor på 180', 1, heltal],
  ['high_out', 'HO', 'Högsta utgång', 1, (v) => v ?? '–'],
  ['basta_leg', 'Bästa', 'Bästa leg (antal pilar)', -1, (v) => v ?? '–'],
  // Detaljer (v0.9.5) – som n01:s stora statistiktabell
  ['vinst_m', 'Vinst-% M', 'Andel vunna matcher', 1, pct, 'd'],
  ['vinst_l', 'Vinst-% L', 'Andel vunna legs', 1, pct, 'd'],
  ['legs_diff', '+/-', 'Legsskillnad (vunna – förlorade)', 1, (v) => (v > 0 ? `+${v}` : v ?? '–'), 'd'],
  ['samsta_leg', 'Sämsta', 'Sämsta vunna leg (antal pilar)', -1, (v) => v ?? '–', 'd'],
  ['snitt1', '1 pil', 'Snitt per pil', 1, (v) => fmt(v, 2), 'd'],
  ['ut100', '100+ ut', 'Utgångar på 100 eller mer', 1, heltal, 'd'],
  ['utg', 'Utgång-%', 'Utgångar / utgångslägen: andel rundor som började på 170 eller mindre (utom 159, 162, 163, 165, 166, 168, 169) och slutade med utgång', 1, pct, 'd'],
  ['co', 'Checkout-%*', 'Uppskattad: utgångar / uppskattat antal pilar mot dubbel. Vår egen uppskattning – n01 räknar med en annan modell', 1, pct, 'd'],
  ['keep', 'Keep', 'Andel vunna legs där spelaren började', 1, pct, 'd'],
  ['brk', 'Break', 'Andel vunna legs där motståndaren började', 1, pct, 'd'],
  ['second', 'Second', 'Legs där motståndaren började', 1, heltal, 'd'],
  ['breaklegs', 'Breaks', 'Vunna legs där motståndaren började', 1, heltal, 'd'],
  ['poang', 'Poäng', 'Totalt kastade poäng', 1, heltal, 'd'],
  ['pilar', 'Pilar', 'Totalt antal pilar', 1, heltal, 'd'],
  ['grupp', 'Grupp', 'Grupp i gruppspelet', -1, (v) => v ?? '–', 'd'],
  ['omg', 'Omg', 'Hur långt spelaren nådde: omgångsnummer, KF/SF/F = kvarts-, semi-, final', 1, null, 'd'],
];

// Flikar på tävlingssidan (v0.9.9, önskemål Henrik 2026-11-02): #/tavling/<tdid>[/matcher|/statistik]
const FLIKAR = [['resultat', 'Resultat'], ['matcher', 'Matcher'], ['statistik', 'Statistik']];

const statOppen = () => { try { return localStorage.getItem('bdc-statdetaljer') === '1'; } catch { return false; } };

// Fält ur n01:s stats_list (per tpid) som vyn inte har
function berika(s, n, u) {
  const kvot = (a, b) => (b ? (100 * a) / b : null);
  s.vinst_m = kvot(s.vunna_matcher, s.matcher);
  s.vinst_l = kvot(s.vunna_legs, s.legs);
  s.legs_diff = s.legs != null ? 2 * s.vunna_legs - s.legs : null;
  s.snitt1 = s.snitt != null ? s.snitt / 3 : null;
  if (u) { s.utg = kvot(u.utgangar, u.utgangslagen); s.utg_text = `${u.utgangar}/${u.utgangslagen}`; }
  if (!n) return;
  s.co = n.co ? checkoutUppskattad(besokUrN01(n.co)).procent : null;
  s.ut100 = n.highOutCount ?? null;
  s.second = n.a_b ?? null; s.breaklegs = n.w_b ?? null;
  s.brk = kvot(n.w_b, n.a_b);
  s.keep = kvot((n.winLeg ?? 0) - (n.w_b ?? 0), (n.leg ?? 0) - (n.a_b ?? 0));
  s.grupp = n.r_g || null;
  s.omg = n.rnd ? (n.rnd > 0 ? n.rnd : 100 + n.rnd) : null;          // sorteringsvärde: F = 99, SF = 98 …
  s.omg_text = n.rnd ? (n.rnd > 0 ? String(n.rnd) : OMG[n.rnd] ?? String(n.rnd)) : '–';
}

export async function visaTavling(app, tdid, flikArg) {
  const q = encodeURIComponent(tdid);
  const [[t], [rad], stat, matcher] = await Promise.all([
    api(`v_turnering?tdid=eq.${q}&select=*`),
    api(`turnering?tdid=eq.${q}&select=rr_table:data->rr_table,rr_result:data->rr_result,rr_title:data->rr_title,t_title:data->t_title,t_table:data->t_table,t_result:data->t_result,rr_setting:data->rr_setting,t_setting:data->t_setting`),
    api(`v_turnering_statistik?tdid=eq.${q}&select=*`),
    api(`v_match?tdid=eq.${q}&select=*&order=ttype,rond,t_no`),
  ]);
  const [[n01stat], utg] = await Promise.all([
    api(`turnering_statistik?tdid=eq.${q}&typ=eq.stats_list&select=data`).catch(() => []),
    api(`v_turnering_utgang?tdid=eq.${q}&select=tpid,utgangar,utgangslagen`).catch(() => []),   // finns efter migration 21
  ]);
  const utgPer = Object.fromEntries(utg.map((u) => [u.tpid, u]));
  // Cuper som tävlingen ingår i (omgång eller finalspel)
  const iCup = await api(`v_tavling_turnering?tdid=eq.${q}&select=tavling_id,roll`).catch(() => []);
  const cuper = iCup.length ? await api(`tavling?id=in.(${iCup.map((c) => c.tavling_id).join(',')})&select=id,namn`) : [];
  const cupLankar = iCup.map((c) => { const cup = cuper.find((x) => x.id === c.tavling_id);
    return cup ? `<a class="chip cuplank" href="#/cup/${cup.id}">🏆 ${esc(cup.namn)}${c.roll === 'final' ? ' – finalspel' : ''} →</a>` : ''; }).join('');
  if (!t) { app.innerHTML = '<p class="fel">Tävlingen finns inte.</p>'; return; }

  stat.forEach((s) => berika(s, n01stat?.data?.[s.tpid], utgPer[s.tpid]));
  const perTpid = Object.fromEntries(stat.map((s) => [s.tpid, s]));
  const flik = FLIKAR.some(([k]) => k === flikArg) ? flikArg : 'resultat';
  let sortering = { nyckel: 'placering', riktning: -1 };

  const ritaTabell = () => {
    // riktning 1 = högst först, -1 = lägst först; tomma värden sist
    const varde = (s) => (sortering.nyckel === 'matcher_vs' ? s.vunna_matcher : sortering.nyckel === 'legs_vs' ? s.vunna_legs : s[sortering.nyckel]);
    const rader = [...stat].sort((a, b) => {
      const va = varde(a), vb = varde(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return (sortering.riktning === 1 ? vb - va : va - vb) || (a.placering ?? 99) - (b.placering ?? 99);
    });
    document.getElementById('stat').innerHTML = `
      <table class="tabell">
        <thead><tr><th class="fast">Spelare</th>${KOLUMNER.map(([n, r, f, , , d]) =>
          `<th${d ? ' class="bara-d"' : ''}><button type="button" data-sort="${n}" title="${esc(f)}" class="${n === sortering.nyckel ? 'sorterad' : ''}">${esc(r)}</button></th>`).join('')}</tr></thead>
        <tbody>${rader.map((s) => `<tr>
          <td class="fast">${spelarlank(s.namn ?? s.tpid, s.spelare_id)}</td>
          ${KOLUMNER.map(([n, , , , f, d]) => `<td${d ? ' class="bara-d"' : ''}>${n === 'matcher_vs' ? `${s.vunna_matcher}–${s.matcher}` : n === 'legs_vs' ? `${s.vunna_legs}–${s.legs}` : n === 'omg' ? esc(s.omg_text) : n === 'utg' && s.utg != null ? `<span title="${esc(s.utg_text)}">${f(s[n])}</span>` : f(s[n])}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table>`;
  };

  // Topplistor ur statistiken
  const hogaUt = stat.filter((s) => s.high_out > 0).sort((a, b) => b.high_out - a.high_out).slice(0, 5);
  const bastaLeg = stat.filter((s) => s.basta_leg).sort((a, b) => a.basta_leg - b.basta_leg).slice(0, 5);
  const t180 = stat.filter((s) => s.t180 > 0).sort((a, b) => b.t180 - a.t180);
  const topp = (titel, lista, varde) => lista.length ? `<div class="kort topp"><h3>${titel}</h3><ol>${lista.map((s) =>
    `<li>${spelarlank(s.namn, s.spelare_id)} <b>${varde(s)}</b></li>`).join('')}</ol></div>` : '';

  app.innerHTML = `
    <p><a href="#/" class="tillbaka">← Tävlingar</a></p>
    <h1>${esc(t.serie ?? t.titel)}${t.omgang ? ` <span class="muted">omg ${t.omgang}</span>` : ''}</h1>
    <p class="muted">${esc(t.datum ?? '')} · ${t.deltagare} spelare · ${t.matcher} matcher${t.startpoang ? ` · ${t.startpoang}` : ''}
      · <a href="${esc(t.n01_url)}" target="_blank" rel="noopener">Öppna i n01 ↗</a></p>
    ${rundregel(rad)}
    ${cupLankar ? `<div class="filter cuplankar">${cupLankar}</div>` : ''}
    <nav class="filter tavlingsflikar" role="tablist" aria-label="Tävlingen">
      ${FLIKAR.map(([k, n]) => `<button type="button" role="tab" class="chip${k === flik ? ' vald' : ''}" data-flik="${k}" aria-selected="${k === flik}">${n}</button>`).join('')}
    </nav>
    <section class="flikpanel" data-panel="resultat"${flik === 'resultat' ? '' : ' hidden'}>
      ${t.vinnare ? `<p class="vinnarrad">🏆 ${spelarlank(t.vinnare, t.vinnare_id)}</p>` : ''}
      ${slutspel(matcher, rad, perTpid)}
      ${grupper(rad, perTpid, matcher)}
    </section>
    <section class="flikpanel" data-panel="matcher"${flik === 'matcher' ? '' : ' hidden'}>
      ${tidslinje(matcher, rad) || '<p class="muted">Inga matcher.</p>'}
    </section>
    <section class="flikpanel" data-panel="statistik"${flik === 'statistik' ? '' : ' hidden'}>
      <div class="topplistor">
        ${topp('Högsta utgångar', hogaUt, (s) => s.high_out)}
        ${topp('Bästa legs', bastaLeg, (s) => `${s.basta_leg} pilar`)}
        ${topp('180:or', t180, (s) => s.t180)}
      </div>
      <h2>Statistik</h2>
      <p class="muted liten">Samma siffror som n01:s statistiksida. Tryck på en rubrik för att sortera.</p>
      <p class="muted liten">* Checkout-% är vår uppskattning av andelen pilar mot dubbel som satt – n01 uppskattar på sitt eget sätt, så siffrorna kan skilja. Utgång-% är exakt: andelen rundor från 170 eller mindre som slutade med utgång.</p>
      <div class="statbox${statOppen() ? ' oppen' : ''}">
        <button type="button" class="detaljer-knapp stat-detaljer" aria-expanded="${statOppen()}">Detaljer <span class="pil">▾</span> <small>Vinst-%, Keep/Break, poäng och pilar m.m.</small></button>
        <div class="rulla" id="stat"></div>
      </div>
    </section>`;

  app.querySelector('#stat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const kol = KOLUMNER.find((k) => k[0] === b.dataset.sort);
    sortering = sortering.nyckel === kol[0] ? { nyckel: kol[0], riktning: -sortering.riktning } : { nyckel: kol[0], riktning: kol[3] };
    ritaTabell();
  });
  app.querySelector('.stat-detaljer').addEventListener('click', (e) => {
    const ar = e.currentTarget.closest('.statbox').classList.toggle('oppen');
    e.currentTarget.setAttribute('aria-expanded', ar);
    try { localStorage.setItem('bdc-statdetaljer', ar ? '1' : '0'); } catch { /* ok */ }
  });
  ritaTabell();
  kopplaTidslinje(app);
  app.querySelector('.tavlingsflikar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-flik]'); if (!b) return;
    const ny = b.dataset.flik;
    app.querySelectorAll('.tavlingsflikar [data-flik]').forEach((x) => { x.classList.toggle('vald', x === b); x.setAttribute('aria-selected', x === b); });
    app.querySelectorAll('.flikpanel').forEach((p) => { p.hidden = p.dataset.panel !== ny; });
    history.replaceState(null, '', `#/tavling/${encodeURIComponent(tdid)}${ny === 'resultat' ? '' : `/${ny}`}`);   // delbar länk, ingen omladdning
  });
}

// Gruppspel ur n01:s rr_table/rr_result: vunna matcher, legs, snitt per grupp
function grupper(rad, perTpid, matcher) {
  const tabell = rad?.rr_table, resultat = rad?.rr_result;
  if (!Array.isArray(tabell) || !tabell.length) return '';
  const namn = (tp) => perTpid[tp]?.namn ?? tp;
  const html = tabell.map((grupp, gi) => {
    const res = resultat?.[gi] ?? {};
    const rader = grupp.filter((tp) => tp && tp !== 'empty').map((tp) => {
      let v = 0, f = 0, lv = 0, lf = 0;
      for (const [mot, r] of Object.entries(res[tp] ?? {})) {
        const motR = res[mot]?.[tp];
        if (r?.r == null || motR?.r == null) continue;
        lv += r.r; lf += motR.r;
        if (r.r > motR.r) v++; else if (r.r < motR.r) f++;
      }
      // Snitt i gruppspelet ur matcherna
      const egna = matcher.filter((m) => m.ttype === 'rr' && (m.tpid_a === tp || m.tpid_b === tp));
      return { tp, v, f, lv, lf, spelade: v + f, egna };
    }).sort((a, b) => b.v - a.v || (b.lv - b.lf) - (a.lv - a.lf) || b.lv - a.lv);
    const titel = rad?.rr_title?.[gi] || `Grupp ${String.fromCharCode(65 + gi)}`;
    const iGruppen = new Set(grupp);
    const gruppMatcher = matcher.filter((m) => m.ttype === 'rr' && iGruppen.has(m.tpid_a) && iGruppen.has(m.tpid_b));
    return `<div class="kort grupp"><h3>${esc(titel)}</h3>
      <table class="tabell liten"><thead><tr><th>Spelare</th><th title="Vunna matcher">V</th><th title="Förlorade matcher">F</th><th title="Legs vunna–förlorade">Legs</th><th title="Legsskillnad">+/-</th></tr></thead>
      <tbody>${rader.map((r) => `<tr><td>${spelarlank(namn(r.tp), perTpid[r.tp]?.spelare_id)}</td><td>${r.v}</td><td>${r.f}</td><td>${r.lv}–${r.lf}</td><td>${r.lv - r.lf > 0 ? '+' : ''}${r.lv - r.lf}</td></tr>`).join('')}</tbody></table>
      ${gruppMatcher.length ? `<details class="gruppmatcher"><summary>Matcherna i gruppen (${gruppMatcher.length})</summary>${gruppMatcher.map(matchrad).join('')}</details>` : ''}</div>`;
  }).join('');
  return `<h2>Gruppspel</h2><div class="grupper">${html}</div>`;
}

// Rondens namn bakifrån (final, semifinal …) eller arrangörens egen rubrik i n01
function rondNamn(typ, r, sista, tTitel) {
  const egen = typ === 't' ? tTitel?.[r] : '';
  if (egen) return egen;
  return ['Final', 'Semifinal', 'Kvartsfinal', 'Åttondelsfinal', 'Sextondelsfinal'][sista - r] ?? `Omgång ${r + 1}`;
}

// Slutspel: matcherna per rond, namngivna bakifrån (final, semifinal …)
function slutspel(matcher, rad, perTpid) {
  const tTitel = rad?.t_title;
  const trad = slutspelstrad(matcher, rad, perTpid);
  const ko = matcher.filter((m) => m.ttype !== 'rr' && m.ttype !== 'lg' && !(trad && m.ttype === 't'));
  if (!ko.length) return trad ?? '';
  const typer = [...new Set(ko.map((m) => m.ttype))];
  const typnamn = { t: 'Slutspel', t3: 'Bronsmatch', s2: 'B-slutspel', s2_3: 'Bronsmatch B-slutspel', dw: 'Vinnarsidan', dl: 'Förlorarsidan', m: 'Matcher' };
  return (trad ?? '') + typer.map((typ) => {
    const lista = ko.filter((m) => m.ttype === typ);
    const ronder = [...new Set(lista.map((m) => m.rond))].sort((a, b) => a - b);
    const rondnamn = (r) => rondNamn(typ, r, ronder.at(-1), tTitel);
    return `<h2>${esc(typnamn[typ] ?? typ)}</h2><div class="ronder">${ronder.map((r) => `
      <div class="kort rond"><h3>${esc(rondnamn(r))}</h3>
        ${lista.filter((m) => m.rond === r).map(matchrad).join('')}
      </div>`).join('')}</div>`;
  }).join('');
}

function matchrad(m) {
  const vinnA = m.legs_a > m.legs_b, vinnB = m.legs_b > m.legs_a;
  return `<div class="match">
    <span class="${vinnA ? 'vinst' : ''}">${spelarlank(m.namn_a, m.spelare_a)} <small class="muted">${fmt(m.snitt_a, 1)}</small></span>
    <a class="resultat" href="#/match/${encodeURIComponent(m.mid)}" title="Visa matchen">${m.legs_a ?? 0}–${m.legs_b ?? 0}</a>
    <span class="${vinnB ? 'vinst' : ''}">${m.namn_b ? spelarlank(m.namn_b, m.spelare_b) : '–'} <small class="muted">${fmt(m.snitt_b, 1)}</small></span>
  </div>`;
}

// Matcherna i tidsordning (v0.9.4, som n01:s matchlista): klockslag, fas, resultat och snitt
const TL_NYCKEL = 'bdc-tidslinje';
const lasTl = () => { try { return JSON.parse(localStorage.getItem(TL_NYCKEL)) ?? {}; } catch { return {}; } };
const sparaTl = (v) => { try { localStorage.setItem(TL_NYCKEL, JSON.stringify({ ...lasTl(), ...v })); } catch { /* ok */ } };

function fasFor(m, matcher, rad) {
  if (m.ttype === 'rr') {
    const gi = (rad?.rr_table ?? []).findIndex((g) => g?.includes(m.tpid_a));
    return gi < 0 ? 'Gruppspel' : (rad?.rr_title?.[gi] || `Grupp ${String.fromCharCode(65 + gi)}`);
  }
  const typnamn = { t3: 'Bronsmatch', s2_3: 'Bronsmatch B-slutspel', m: 'Match' };
  if (typnamn[m.ttype]) return typnamn[m.ttype];
  const sista = Math.max(...matcher.filter((x) => x.ttype === m.ttype).map((x) => x.rond));
  const namn = rondNamn(m.ttype, m.rond, sista, rad?.t_title);
  return { s2: `B-slutspel ${namn.toLowerCase()}`, dw: `Vinnarsidan ${namn.toLowerCase()}`, dl: `Förlorarsidan ${namn.toLowerCase()}` }[m.ttype] ?? namn;
}

function tidslinje(matcher, rad) {
  const lista = matcher.filter((m) => m.ttype !== 'lg' && m.starttid);
  if (!lista.length) return '';
  const st = lasTl();
  const senastForst = st.ordning !== 'forst';
  lista.sort((a, b) => (senastForst ? -1 : 1) * (new Date(a.starttid) - new Date(b.starttid)));
  return `<div class="tidslinje">
    <h2>Matcher i tidsordning <span class="muted">(${lista.length})</span></h2>
    <div class="filter tl-ordning">
      <button type="button" class="chip${senastForst ? ' vald' : ''}" data-ordning="senast">Senaste först</button>
      <button type="button" class="chip${senastForst ? '' : ' vald'}" data-ordning="forst">Första först</button>
    </div>
    <div class="kort tl-lista" data-ordning="${senastForst ? 'senast' : 'forst'}">${lista.map((m) => `<div class="tl-rad">
      <div class="tl-huvud"><b>${esc(datumTid(m.starttid).slice(11))}</b> · ${esc(fasFor(m, matcher, rad))}${m.klar === false ? ' · <span class="etikett">pågår</span>' : ''}</div>
      ${matchrad(m)}</div>`).join('')}</div>
  </div>`;
}

function kopplaTidslinje(app) {
  const d = app.querySelector('.tidslinje');
  if (!d) return;
  d.querySelector('.tl-ordning').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ordning]'); if (!b) return;
    sparaTl({ ordning: b.dataset.ordning });
    const lista = d.querySelector('.tl-lista');
    if (lista.dataset.ordning !== b.dataset.ordning) {
      [...lista.children].reverse().forEach((r) => lista.appendChild(r));
      lista.dataset.ordning = b.dataset.ordning;
    }
    d.querySelectorAll('.tl-ordning [data-ordning]').forEach((x) => x.classList.toggle('vald', x === b));
  });
}

// Slutspelsträd (v0.9.7, önskemål Henrik 2026-11-02) ur n01:s t_table/t_result.
// t_table[r] = platserna i rond r (par 2k/2k+1 möts, "" = fribiljett); sista raden = vinnaren.
// Inledande ronder där mer än hälften är fribiljetter visas inte som egna kolumner – de som
// spelade där får en liten notis vid namnet i första visade ronden.
function slutspelstrad(matcher, rad, perTpid) {
  const tab = rad?.t_table, res = rad?.t_result ?? [];
  if (!Array.isArray(tab) || tab.length < 2 || !tab.some((r) => r.some(Boolean))) return null;
  const sista = tab.length - 2;                                    // sista ronden med match (finalen)
  const par = (r) => Array.from({ length: Math.ceil(tab[r].length / 2) }, (_, k) => [tab[r][2 * k] || '', tab[r][2 * k + 1] || '']);
  const riktig = ([a, b]) => a && b;
  let forsta = 0;
  while (forsta < sista && par(forsta).filter(riktig).length * 2 < par(forsta).length) forsta++;
  const resultat = (r, a, b) => res[r]?.[a]?.[b];
  const mid = (r, a, b) => matcher.find((m) => m.ttype === 't' && m.rond === r
    && ((m.tpid_a === a && m.tpid_b === b) || (m.tpid_a === b && m.tpid_b === a)))?.mid;
  const namn = (tp) => perTpid[tp]?.namn ?? tp;
  // Notiser för de inledande ronderna som inte visas
  const via = {};
  for (let r = 0; r < forsta; r++) for (const [a, b] of par(r).filter(riktig)) {
    const ra = resultat(r, a, b), rb = resultat(r, b, a);
    if (ra?.r == null || rb?.r == null) continue;
    const v = ra.r > rb.r ? a : b;
    via[v] = `${esc(rondNamn('t', r, sista, rad?.t_title))}: ${Math.max(ra.r, rb.r)}–${Math.min(ra.r, rb.r)} mot ${esc(namn(v === a ? b : a))}`;
  }
  const rad1 = (tp, mot, r, vann, m) => {
    if (!tp) return `<div class="tr-spelare tom"><span class="muted">${mot ? 'fribiljett' : '–'}</span><b></b></div>`;
    const x = mot ? resultat(r, tp, mot) : null;
    return `<div class="tr-spelare${vann ? ' vann' : ''}">
      <span>${spelarlank(namn(tp), perTpid[tp]?.spelare_id)}${x?.a != null ? ` <small class="muted">${fmt(x.a, 1)}</small>` : ''}${r === forsta && via[tp] ? `<small class="tr-via">${via[tp]}</small>` : ''}</span>
      ${m ? `<a class="tr-poang" href="#/match/${encodeURIComponent(m)}" title="Visa matchen">${x?.r ?? ''}</a>` : `<b>${x?.r ?? ''}</b>`}</div>`;
  };
  const matchKort = (r, [a, b]) => {
    const ra = resultat(r, a, b), rb = resultat(r, b, a);
    const klar = ra?.r != null && rb?.r != null && ra.r !== rb.r;
    const m = a && b ? mid(r, a, b) : null;
    return `<div class="tr-match${a && b ? '' : ' fri'}">${rad1(a, b, r, klar && ra.r > rb.r, m)}${rad1(b, a, r, klar && rb.r > ra.r, m)}</div>`;
  };
  const kolumner = [];
  for (let r = forsta; r <= sista; r++) {
    const p = par(r);
    const grupper = [];
    for (let i = 0; i < p.length; i += 2) grupper.push(p.slice(i, i + 2));
    kolumner.push(`<div class="tr-kol${r === sista ? ' final' : ''}"><h3>${esc(rondNamn('t', r, sista, rad?.t_title))}</h3>
      <div class="tr-ronder">${grupper.map((g) => `<div class="tr-par${g.length === 2 ? '' : ' ensam'}">${g.map((x) => matchKort(r, x)).join('')}</div>`).join('')}</div></div>`);
  }
  const vinnare = tab[sista + 1]?.[0];
  if (vinnare) kolumner.push(`<div class="tr-kol vinnare"><h3>Vinnare</h3><div class="tr-ronder"><div class="tr-par ensam"><div class="tr-match vinnarkort">🏆 ${spelarlank(namn(vinnare), perTpid[vinnare]?.spelare_id)}</div></div></div></div>`);
  return `<h2>Slutspel</h2>
    <p class="muted liten">Tryck på siffrorna för att se matchens protokoll. Dra i sidled för att se hela trädet.</p>
    <div class="trad-rulla"><div class="trad">${kolumner.join('')}</div></div>`;
}

// Rundgräns (v0.9.8, önskemål Henrik 2026-11-02): n01:s inställning per tävling – limit = 1 betyder att
// ett leg som inte är avgjort efter "rounds" rundor avgörs med närmast bull. Gruppspel och slutspel kan skilja.
function rundregel(rad) {
  const grans = (x) => (x && Number(x.limit) === 1 && Number(x.rounds) > 0 ? Number(x.rounds) : null);
  const g = rad?.rr_setting?.round_robin ? grans(rad.rr_setting) : null;
  const t = rad?.t_setting?.tournament ? grans(rad.t_setting) : null;
  if (!g && !t) return '';
  const text = (n) => `max ${n} rundor (${3 * n} pilar var)`;
  const del = g && t && g !== t ? `gruppspel ${text(g)}, slutspel ${text(t)}` : text(g ?? t);
  return `<p class="rundregel">🎯 Regel: ${del} per leg – är ingen ute då avgör <b>närmast bull</b>.</p>`;
}
