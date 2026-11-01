// Matchprotokoll som n01 (v0.9.3, önskemål Henrik 2026-11-01): statistik med Detaljer att fälla ut
// och varje leg uppifrån och ned (Poäng | Kvar | pilar | Poäng | Kvar). Används av match.js och serien.js.
import { esc, fmt } from './lib.js?v=0.9.7';
import { utgangslage, checkoutUppskattad } from './utgang.js?v=0.9.7';

const NYCKEL = 'bdc-detaljer';
const intervall = (k, fran, till) => k.filter((x) => x.poang >= fran && x.poang <= till).length;

// All statistik för en sida (0/1) ur rundorna. legsVunna kommer från matchen (n01:s siffra).
export function rakna(kast, legs, s, legsVunna) {
  const k = kast.filter((x) => x.sida === s);
  if (!k.length) return null;
  const poang = k.reduce((t, x) => t + x.poang, 0), pilar = k.reduce((t, x) => t + x.pilar, 0);
  const f9 = k.filter((x) => x.runda <= 3);
  const f9p = f9.reduce((t, x) => t + x.pilar, 0);
  const legPilar = (nr) => k.filter((x) => x.leg_nr === nr).reduce((t, x) => t + x.pilar, 0);
  const vunna = legs.filter((l) => l.vinnare === s && !l.mfd).map((l) => legPilar(l.nr));
  const ut = k.filter((x) => x.utgang).map((x) => x.poang);
  return {
    legs: legsVunna ?? legs.filter((l) => l.vinnare === s).length,
    snitt: pilar ? (3 * poang) / pilar : null,
    f9: f9p ? (3 * f9.reduce((t, x) => t + x.poang, 0)) / f9p : null,
    t60: intervall(k, 60, 79), t80: intervall(k, 80, 99), t100: intervall(k, 100, 119), t120: intervall(k, 120, 139),
    t100k: intervall(k, 100, 139), t140: intervall(k, 140, 169), t140k: intervall(k, 140, 179), t170: intervall(k, 170, 179),
    t180: intervall(k, 180, 180),
    utgang: ut.length ? Math.max(...ut) : null, ut100: ut.filter((p) => p >= 100).length,
    basta: vunna.length ? Math.min(...vunna) : null,
    pilarPerLeg: vunna.length ? vunna.reduce((t, x) => t + x, 0) / vunna.length : null,
    hogsta: Math.max(...k.map((x) => x.poang)),
    utgLagen: k.filter((x) => utgangslage(x.kvar + x.poang)).length, utgangar: ut.length,
    co: checkoutUppskattad(k.map((x) => [x.kvar + x.poang, x.kvar, x.pilar])).procent,
  };
}

// [rubrik, värde, var: 'k' = bara ihopfälld, 'd' = bara Detaljer, '' = alltid]
const RADER = [
  ['Legs', (s) => s.legs ?? '–', ''],
  ['3-pilssnitt', (s) => fmt(s.snitt, 2), ''],
  ['First 9', (s) => fmt(s.f9, 2), ''],
  ['60+', (s) => s.t60, 'd'], ['80+', (s) => s.t80, 'd'],
  ['100+', (s) => s.t100k, 'k'], ['100+', (s) => s.t100, 'd'], ['120+', (s) => s.t120, 'd'],
  ['140+', (s) => s.t140k, 'k'], ['140+', (s) => s.t140, 'd'], ['170+', (s) => s.t170, 'd'],
  ['180', (s) => s.t180, ''],
  ['Högsta utgång', (s) => s.utgang ?? '–', ''],
  ['100+ utgångar', (s) => s.ut100, 'd'],
  ['Utgång-%', (s) => (s.utgLagen ? `${fmt((100 * s.utgangar) / s.utgLagen, 1)} % <small class="muted">${s.utgangar}/${s.utgLagen}</small>` : '–'), 'd'],
  ['Checkout-% (uppsk.)', (s) => (s.co != null ? `${fmt(s.co, 1)} %` : '–'), 'd'],
  ['Bästa leg', (s) => (s.basta != null ? `${s.basta} pilar` : '–'), ''],
  ['Pilar per vunnet leg', (s) => fmt(s.pilarPerLeg, 1), 'd'],
  ['Högsta runda', (s) => s.hogsta ?? '–', 'd'],
];

function oppen() { try { return localStorage.getItem(NYCKEL) === '1'; } catch { return false; } }

export function statistikHtml(namnA, namnB, a, b) {
  const v = (s, f) => (s ? f(s) ?? '–' : '–');
  return `<div class="kort matchstat${oppen() ? ' oppen' : ''}">
    <table class="tabell jamfor">
      <thead><tr><th>${esc(namnA)}</th><th></th><th>${esc(namnB)}</th></tr>
        <tr><th colspan="3" class="detaljrad"><button type="button" class="detaljer-knapp" aria-expanded="${oppen()}">Detaljer <span class="pil">▾</span></button></th></tr></thead>
      <tbody>${RADER.map(([n, f, var_]) => `<tr${var_ ? ` class="bara-${var_}"` : ''}><td>${v(a, f)}</td><td class="muted">${n}</td><td>${v(b, f)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="muted liten">100+ = 100–139 och 140+ = 140–179 i den korta listan; under Detaljer delas de upp som hos n01.</p>
  </div>`;
}

// namn(s) ger sidans namn. Varje leg: startpoäng överst, en rad per runda, utgången som "xN" (pilar på sista rundan).
export function legsHtml(legs, kast, namn) {
  return legs.map((l) => {
    const k = kast.filter((x) => x.leg_nr === l.nr);
    const sida = [0, 1].map((s) => k.filter((x) => x.sida === s).sort((x, y) => x.runda - y.runda));
    const antal = Math.max(sida[0].length, sida[1].length);
    const start = (r) => (r.length ? r[0].kvar + r[0].poang : '');
    const pilar = (r) => r.reduce((t, x) => t + x.pilar, 0);
    const snitt = (r) => (pilar(r) ? (3 * r.reduce((t, x) => t + x.poang, 0)) / pilar(r) : null);
    const celler = (x) => {
      if (!x) return '<td></td><td></td>';
      if (x.utgang) return `<td class="ut" title="Utgång ${x.poang} med ${x.pilar} pilar">${x.poang}</td><td class="ut-pilar">x${x.pilar}</td>`;
      const klass = x.poang === 180 ? ' class="max"' : x.poang >= 100 ? ' class="hog"' : '';
      return `<td${klass}><span>${x.poang}</span></td><td class="kvar">${x.kvar}</td>`;
    };
    const huvud = (s) => `<span class="${l.vinnare === s ? 'vann' : 'muted'}">${l.forst === s ? '<span class="borjade" title="Började">*</span> ' : ''}${esc(namn(s))}</span>`;
    const rader = Array.from({ length: antal }, (_, i) => `<tr>${celler(sida[0][i])}<td class="pilnr">${3 * (i + 1)}</td>${celler(sida[1][i])}</tr>`).join('');
    return `<div class="kort leg">
      <div class="leghuvud">${huvud(0)}<b>Leg ${l.nr + 1}</b>${huvud(1)}</div>
      ${l.mfd ? '<p class="muted liten">Avgjort med närmast bull.</p>' : ''}
      <table class="protokoll">
        <thead><tr><th>Poäng</th><th>Kvar</th><th></th><th>Poäng</th><th>Kvar</th></tr></thead>
        <tbody><tr class="start"><td></td><td class="kvar">${start(sida[0])}</td><td class="pilnr"></td><td></td><td class="kvar">${start(sida[1])}</td></tr>${rader}</tbody>
        <tfoot><tr><td colspan="2">${pilar(sida[0])} pilar · ${fmt(snitt(sida[0]), 2)}</td><td></td><td colspan="2">${pilar(sida[1])} pilar · ${fmt(snitt(sida[1]), 2)}</td></tr></tfoot>
      </table>
    </div>`;
  }).join('');
}

export function protokollSida(statistik, legs, forklaring = '') {
  return `<div class="matchvy">
    <section class="matchvy-stat"><h2>Statistik</h2>${statistik}</section>
    <section class="matchvy-legs"><h2>Poäng</h2>
      <p class="muted liten">Varje rad är en runda om tre pilar; mittkolumnen räknar pilarna. Överst startpoängen. * = började legget, fet = vann. Ring = 100 eller mer, fylld = 180, mint = utgång (xN = pilar på sista rundan).${forklaring}</p>
      <div class="legs">${legs}</div></section>
  </div>`;
}

export function koppla(app) {
  app.querySelector('.detaljer-knapp')?.addEventListener('click', (e) => {
    const kort = e.currentTarget.closest('.matchstat');
    const ar = kort.classList.toggle('oppen');
    e.currentTarget.setAttribute('aria-expanded', ar);
    try { localStorage.setItem(NYCKEL, ar ? '1' : '0'); } catch { /* inget minne – ok */ }
  });
}
