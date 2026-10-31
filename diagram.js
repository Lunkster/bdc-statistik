// Egna SVG-diagram utan bibliotek: punkter över tid + glidande snitt, tooltip vid hover/fokus/tryck.
// Format enligt SI oberoende av webbläsarens språk.
import { fmt } from './lib.js?v=0.4.1';

const B = 640, H = 300, M = { v: 62, h: 14, o: 18, n: 40 };   // vänster, höger, över, nedre marginal

// Snygga steg för y-axeln
function steg(min, max, antal = 4, heltal = false) {
  const span = max - min || 1;
  const grov = span / antal;
  const p = 10 ** Math.floor(Math.log10(grov));
  let s = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => span / x <= antal) ?? 10 * p;
  if (heltal) s = Math.max(1, Math.round(s));
  const fran = Math.floor(min / s) * s, till = Math.ceil(max / s) * s;
  const ut = []; for (let v = fran; v <= till + s / 2; v += s) ut.push(+v.toFixed(6));
  return ut;
}

// Glidande medelvärde över n punkter
function glidande(punkter, n) {
  return punkter.map((p, i) => {
    const urval = punkter.slice(Math.max(0, i - n + 1), i + 1);
    return { x: p.x, y: urval.reduce((s, q) => s + q.y, 0) / urval.length };
  });
}

/**
 * punkter: [{ x: ms, y: tal, datum: 'ÅÅÅÅ-MM-DD', text: 'förklaring', lank: '#/…' }]
 * val: { decimaler, enhet, lagreArBattre, glid }
 */
export function tidsdiagram(punkter, val = {}) {
  const p = punkter.filter((q) => q.y !== null && q.y !== undefined && !Number.isNaN(q.y)).sort((a, b) => a.x - b.x);
  if (p.length < 2) return `<p class="muted liten">För få värden för en graf (${p.length}).</p>`;
  const d = val.decimaler ?? 1, enhet = val.enhet ? ` ${val.enhet}` : '';
  const ys = p.map((q) => q.y);
  const yt = steg(Math.min(...ys), Math.max(...ys), 4, d === 0);
  const y0 = yt[0], y1 = yt.at(-1);
  const x0 = p[0].x, x1 = p.at(-1).x === x0 ? x0 + 1 : p.at(-1).x;
  const sx = (x) => M.v + ((x - x0) / (x1 - x0)) * (B - M.v - M.h);
  const sy = (y) => H - M.n - ((y - y0) / (y1 - y0 || 1)) * (H - M.n - M.o);

  // x-axel: månader
  const manader = [];
  const d0 = new Date(x0); d0.setUTCDate(1); d0.setUTCHours(0, 0, 0, 0);
  for (let t = new Date(d0); t.getTime() <= x1; t.setUTCMonth(t.getUTCMonth() + 1)) if (t.getTime() >= x0) manader.push(t.getTime());
  const varannan = manader.length > 7 ? 2 : 1;
  const nKort = val.glid ?? Math.min(5, Math.max(2, Math.round(p.length / 8)));
  const nLang = Math.min(nKort * 10, p.length);           // långsam trend: tio gånger fler punkter
  const trend = glidande(p, nKort);
  const trendLang = p.length >= nKort * 3 ? glidande(p, nLang) : null;

  const grid = yt.map((v) => `<line x1="${M.v}" x2="${B - M.h}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/>
    <text x="${M.v - 10}" y="${sy(v) + 7}" class="axel" text-anchor="end">${fmt(v, Number.isInteger(v) ? 0 : d)}</text>`).join('');
  const xax = manader.filter((_, i) => i % varannan === 0).map((t) => {
    const dt = new Date(t);
    return `<text x="${sx(t)}" y="${H - 10}" class="axel" text-anchor="middle">${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}</text>`;
  }).join('');
  const bana = (t) => t.map((q, i) => `${i ? 'L' : 'M'}${sx(q.x).toFixed(1)},${sy(q.y).toFixed(1)}`).join(' ');
  const linje = bana(trend);
  const prickar = p.map((q, i) => `<a href="${q.lank ?? '#'}" class="punkt" data-i="${i}" tabindex="0" aria-label="${fmt(q.y, d)}${enhet}, ${q.datum}">
      <circle cx="${sx(q.x)}" cy="${sy(q.y)}" r="8" class="prick"/></a>`).join('');

  const id = `d${Math.random().toString(36).slice(2, 8)}`;
  // Data till tooltipen läggs som JSON (texter sätts med textContent)
  setTimeout(() => koppla(id, p, d, enhet), 0);
  return `<div class="diagram" id="${id}">
    <svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Diagram över tid">${grid}${xax}
      ${trendLang ? `<path d="${bana(trendLang)}" class="trend lang"/>` : ''}<path d="${linje}" class="trend"/>${prickar}</svg>
    <div class="tooltip" hidden><b></b><span></span><small></small></div>
    <div class="forklaring"><span class="nyckel prick-nyckel"></span>${val.punktnamn ?? 'per match'}<span class="nyckel linje-nyckel"></span>snitt senaste ${nKort}${trendLang ? `<span class="nyckel linje-nyckel lang"></span>snitt senaste ${nLang}` : ''}${val.lagreArBattre ? ' · lägre är bättre' : ''}</div>
  </div>`;
}

function koppla(id, p, d, enhet) {
  const rot = document.getElementById(id); if (!rot) return;
  const svg = rot.querySelector('svg');
  const tip = rot.querySelector('.tooltip');
  const [v, t, s] = tip.children;
  const punkter = [...rot.querySelectorAll('.punkt')];
  let aktiv = null;
  const visa = (el) => {
    const q = p[Number(el.dataset.i)];
    v.textContent = `${fmt(q.y, d)}${enhet}`; t.textContent = ` ${q.datum}`; s.textContent = q.text ?? '';
    const r = rot.getBoundingClientRect(), c = el.querySelector('.prick').getBoundingClientRect();
    tip.hidden = false;
    const x = Math.min(Math.max(c.left - r.left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth);
    tip.style.left = `${x}px`; tip.style.top = `${Math.max(c.top - r.top - tip.offsetHeight - 10, 0)}px`;
    if (aktiv) aktiv.classList.remove('aktiv');
    aktiv = el; el.classList.add('aktiv');
  };
  const dolj = () => { tip.hidden = true; if (aktiv) aktiv.classList.remove('aktiv'); aktiv = null; };
  // Närmaste punkt till pekaren (punkter samma kväll ligger tätt)
  const narmast = (e) => {
    let bast = null, avst = Infinity;
    for (const el of punkter) {
      const c = el.querySelector('.prick').getBoundingClientRect();
      const dx = c.left + c.width / 2 - e.clientX, dy = c.top + c.height / 2 - e.clientY;
      const a = dx * dx + dy * dy * 0.25;   // x väger tyngre än y
      if (a < avst) { avst = a; bast = el; }
    }
    return bast;
  };
  svg.addEventListener('pointermove', (e) => { const el = narmast(e); if (el && el !== aktiv) visa(el); });
  svg.addEventListener('click', (e) => {
    e.preventDefault();
    const el = narmast(e); if (!el) return;
    // Mus: klick öppnar. Pekskärm: första trycket visar värdet, andra öppnar.
    if (e.pointerType === 'mouse' || el === aktiv) location.hash = el.getAttribute('href'); else visa(el);
  });
  punkter.forEach((el) => el.addEventListener('focus', () => visa(el)));
  rot.addEventListener('pointerleave', dolj);
}
