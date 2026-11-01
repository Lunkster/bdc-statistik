// Karusell (v0.8.0, önskemål Henrik 2026-11-01): pågående cupers topplistor, distriktsseriens tabeller
// där Bankeryd spelar och klubbrekorden. Byter bild automatiskt; svep eller tryck på prickarna.
// Visas överst på startsidan och i helskärm på #/karusell (t.ex. på en skärm i klubblokalen).
import { api, esc, fmt, spelarlank } from './lib.js?v=0.8.0';
import { hamtaRekord, rekordKort } from './rekord.js?v=0.8.0';

let timer = null;
const idag = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());

async function bilder() {
  const d = idag();
  const [cuper, bkLag] = await Promise.all([
    api('tavling?typ=eq.klubbcup&aktiv=eq.true&select=id,namn,fran,till,kvalgrans&order=fran.desc'),
    api('ds_lag?bankeryd=eq.true&select=tdid,namn').catch(() => []),
  ]);
  const pagaende = cuper.filter((c) => (!c.fran || c.fran <= d) && (!c.till || c.till >= d));
  const tdids = [...new Set(bkLag.map((l) => l.tdid))];
  const [poang, tabell, R] = await Promise.all([
    pagaende.length ? api(`v_cup_poang?tavling_id=in.(${pagaende.map((c) => c.id).join(',')})&select=tavling_id,spelare_id,n01_namn,visas,summa&order=summa.desc`) : [],
    tdids.length ? api(`v_ds_tabell?tdid=in.(${tdids.map((t) => `"${t}"`).join(',')})&select=*&order=placering`) : [],
    hamtaRekord(3),
  ]);
  const ut = [];
  for (const c of pagaende) {
    const rader = poang.filter((p) => p.tavling_id === c.id).slice(0, 8);
    ut.push(`<div class="bild"><h2><a href="#/cup/${c.id}">${esc(c.namn)}</a></h2><p class="muted liten">Topplista · poäng</p>
      <ol class="topp">${rader.map((p) => `<li class="${c.kvalgrans && p.summa >= c.kvalgrans ? 'kval' : ''}"><span>${spelarlank(p.visas, p.spelare_id)}</span><b>${p.summa}</b></li>`).join('') || '<li class="muted">Inga omgångar än.</li>'}</ol></div>`);
  }
  for (const t of tdids) {
    const rader = tabell.filter((r) => r.tdid === t);
    if (!rader.length) continue;
    ut.push(`<div class="bild"><h2><a href="#/serien/${encodeURIComponent(t)}">Distriktsserien ${esc(rader[0].division)}</a></h2><p class="muted liten">Serietabell · S V O F +/− P</p>
      <ol class="topp serie">${rader.map((r) => `<li class="${r.bankeryd ? 'vart' : ''}"><span>${esc(r.lag)}</span><small>${r.spelade} ${r.vunna} ${r.oavgjorda} ${r.forlorade} ${r.diff > 0 ? '+' : ''}${r.diff}</small><b>${r.poang}</b></li>`).join('')}</ol></div>`);
  }
  const kort = rekordKort(R);
  ut.push(`<div class="bild"><h2><a href="#/rekord">Klubbrekord 501</a></h2><p class="muted liten">Etta i varje gren</p>
    <ol class="topp rekord">${kort.filter(([, , rader]) => rader.length).slice(0, 6).map(([titel, , rader, varde]) =>
      `<li><span>${titel}<br><small>${spelarlank(rader[0].namn, rader[0].spelare_id)}</small></span>${varde(rader[0])}</li>`).join('')}</ol></div>`);
  return ut;
}

export async function visaKarusell(el, { intervall = 8000, helskarm = false } = {}) {
  const ut = await bilder();
  if (!ut.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="karusell${helskarm ? ' helskarm' : ''}" aria-roledescription="karusell">
      <div class="spar">${ut.join('')}</div>
      <div class="prickar">${ut.map((_, i) => `<button type="button" class="prick" data-i="${i}" aria-label="Bild ${i + 1}"></button>`).join('')}
        ${helskarm ? '<a href="#/" class="liten">Stäng</a>' : '<a href="#/karusell" class="liten" title="Visa i helskärm, t.ex. på en skärm i klubblokalen">⛶ Helskärm</a>'}</div>
    </div>`;
  const spar = el.querySelector('.spar'), prickar = [...el.querySelectorAll('.prick')];
  let nu = 0, paus = false;
  const visa = (i, mjukt = true) => { nu = (i + ut.length) % ut.length; spar.scrollTo({ left: nu * spar.clientWidth, behavior: mjukt ? 'smooth' : 'auto' }); markera(); };
  const markera = () => prickar.forEach((p, i) => p.classList.toggle('vald', i === nu));
  spar.addEventListener('scroll', () => { const i = Math.round(spar.scrollLeft / Math.max(1, spar.clientWidth)); if (i !== nu) { nu = i; markera(); } }, { passive: true });
  el.querySelector('.prickar').addEventListener('click', (e) => { const b = e.target.closest('.prick'); if (b) visa(Number(b.dataset.i)); });
  el.addEventListener('pointerenter', () => { paus = true; });
  el.addEventListener('pointerleave', () => { paus = false; });
  markera();
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.body.contains(el) || !el.querySelector('.spar')) { clearInterval(timer); return; }
    if (!paus && !document.hidden) visa(nu + 1);
  }, intervall);
}

export async function visaKarusellSida(app) {
  document.body.classList.add('tv');
  app.innerHTML = '<div id="karusell"></div>';
  await visaKarusell(app.querySelector('#karusell'), { intervall: 15000, helskarm: true });
}
