// Turneringssida: samma statistik som n01:s statistiksida, grupper och slutspel
import { api, esc, fmt, heltal, spelarlank } from './lib.js?v=0.3.0';

const KOLUMNER = [
  // nyckel, rubrik, förklaring, sortering (1 = högst först, -1 = lägst först), format
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
];

export async function visaTurnering(app, tdid) {
  const q = encodeURIComponent(tdid);
  const [[t], [rad], stat, matcher] = await Promise.all([
    api(`v_turnering?tdid=eq.${q}&select=*`),
    api(`turnering?tdid=eq.${q}&select=rr_table:data->rr_table,rr_result:data->rr_result,rr_title:data->rr_title,t_title:data->t_title`),
    api(`v_turnering_statistik?tdid=eq.${q}&select=*`),
    api(`v_match?tdid=eq.${q}&select=*&order=ttype,rond,t_no`),
  ]);
  if (!t) { app.innerHTML = '<p class="fel">Turneringen finns inte.</p>'; return; }

  const perTpid = Object.fromEntries(stat.map((s) => [s.tpid, s]));
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
        <thead><tr><th class="fast">Spelare</th>${KOLUMNER.map(([n, r, f]) =>
          `<th><button type="button" data-sort="${n}" title="${esc(f)}" class="${n === sortering.nyckel ? 'sorterad' : ''}">${esc(r)}</button></th>`).join('')}</tr></thead>
        <tbody>${rader.map((s) => `<tr>
          <td class="fast">${spelarlank(s.namn ?? s.tpid, s.spelare_id)}</td>
          ${KOLUMNER.map(([n, , , , f]) => `<td>${n === 'matcher_vs' ? `${s.vunna_matcher}–${s.matcher}` : n === 'legs_vs' ? `${s.vunna_legs}–${s.legs}` : f(s[n])}</td>`).join('')}
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
    <p><a href="#/" class="tillbaka">← Turneringar</a></p>
    <h1>${esc(t.serie ?? t.titel)}${t.omgang ? ` <span class="muted">omg ${t.omgang}</span>` : ''}</h1>
    <p class="muted">${esc(t.datum ?? '')} · ${t.deltagare} spelare · ${t.matcher} matcher${t.startpoang ? ` · ${t.startpoang}` : ''}
      · <a href="${esc(t.n01_url)}" target="_blank" rel="noopener">Öppna i n01 ↗</a></p>
    ${t.vinnare ? `<p class="vinnarrad">🏆 ${spelarlank(t.vinnare, t.vinnare_id)}</p>` : ''}
    <div class="topplistor">
      ${topp('Högsta utgångar', hogaUt, (s) => s.high_out)}
      ${topp('Bästa legs', bastaLeg, (s) => `${s.basta_leg} pilar`)}
      ${topp('180:or', t180, (s) => s.t180)}
    </div>
    <h2>Statistik</h2>
    <p class="muted liten">Samma siffror som n01:s statistiksida. Tryck på en rubrik för att sortera.</p>
    <div class="rulla" id="stat"></div>
    ${grupper(rad, perTpid, matcher)}
    ${slutspel(matcher, rad?.t_title)}`;

  app.querySelector('#stat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const kol = KOLUMNER.find((k) => k[0] === b.dataset.sort);
    sortering = sortering.nyckel === kol[0] ? { nyckel: kol[0], riktning: -sortering.riktning } : { nyckel: kol[0], riktning: kol[3] };
    ritaTabell();
  });
  ritaTabell();
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
    return `<div class="kort grupp"><h3>${esc(titel)}</h3>
      <table class="tabell liten"><thead><tr><th>Spelare</th><th title="Vunna matcher">V</th><th title="Förlorade matcher">F</th><th title="Legs vunna–förlorade">Legs</th><th title="Legsskillnad">+/-</th></tr></thead>
      <tbody>${rader.map((r) => `<tr><td>${spelarlank(namn(r.tp), perTpid[r.tp]?.spelare_id)}</td><td>${r.v}</td><td>${r.f}</td><td>${r.lv}–${r.lf}</td><td>${r.lv - r.lf > 0 ? '+' : ''}${r.lv - r.lf}</td></tr>`).join('')}</tbody></table></div>`;
  }).join('');
  return `<h2>Gruppspel</h2><div class="grupper">${html}</div>`;
}

// Slutspel: matcherna per rond, namngivna bakifrån (final, semifinal …)
function slutspel(matcher, tTitel) {
  const ko = matcher.filter((m) => m.ttype !== 'rr' && m.ttype !== 'lg');
  if (!ko.length) return '';
  const typer = [...new Set(ko.map((m) => m.ttype))];
  const typnamn = { t: 'Slutspel', t3: 'Bronsmatch', s2: 'B-slutspel', s2_3: 'Bronsmatch B-slutspel', dw: 'Vinnarsidan', dl: 'Förlorarsidan', m: 'Matcher' };
  return typer.map((typ) => {
    const lista = ko.filter((m) => m.ttype === typ);
    const ronder = [...new Set(lista.map((m) => m.rond))].sort((a, b) => a - b);
    const sista = ronder.at(-1);
    const rondnamn = (r) => {
      const egen = typ === 't' ? tTitel?.[r] : '';
      if (egen) return egen;
      const kvar = sista - r;
      return ['Final', 'Semifinal', 'Kvartsfinal', 'Åttondelsfinal'][kvar] ?? `Omgång ${r + 1}`;
    };
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
