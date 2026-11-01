// Klubbrekord på 501 (v0.8.1, önskemål Henrik 2026-11-01): bästa leg, högsta utgång, 180:or,
// högsta snitt i en match och i en turnering. Bara klubbens turneringar och legs som startade på 501.
import { api, esc, fmt, spelarlank } from './lib.js?v=0.8.1';

const N = 10;
const mlank = (mid) => `#/match/${encodeURIComponent(mid)}`;
const tlank = (tdid) => `#/turnering/${encodeURIComponent(tdid)}`;

// Hämtar alla rekordlistor (används också av karusellen)
export async function hamtaRekord(n = N) {
  const turn = await api('turnering?startpoang=eq.501&select=tdid,datum,serie,omgang,titel');
  const T = Object.fromEntries(turn.map((t) => [t.tdid, t]));
  const ids = `in.(${turn.map((t) => `"${t.tdid}"`).join(',')})`;
  const [legs, utg, match, turnSnitt, t180rader, match180] = await Promise.all([
    api(`v_rekord_leg?start=eq.501&vunnet_med_pilar=is.true&order=pilar.asc,datum.asc&limit=${n}&select=mid,tdid,datum,namn,spelare_id,mot_namn,pilar,snitt`),
    api(`v_rekord_leg?start=eq.501&utgang=not.is.null&order=utgang.desc,datum.asc&limit=${n}&select=mid,tdid,datum,namn,spelare_id,mot_namn,utgang`),
    api(`v_spelare_match?tdid=${ids}&order=snitt.desc.nullslast&limit=${n}&select=mid,tdid,datum,namn,spelare_id,mot_namn,snitt,legs_vunna,legs_forlorade`),
    api(`v_turnering_statistik?tdid=${ids}&matcher=gte.3&order=snitt.desc.nullslast&limit=${n}&select=tdid,namn,spelare_id,snitt,matcher`),
    api(`v_turnering_statistik?tdid=${ids}&t180=gt.0&select=tdid,namn,spelare_id,t180`),
    api(`v_spelare_match?tdid=${ids}&t180=gt.0&order=t180.desc&limit=${n}&select=mid,tdid,datum,namn,spelare_id,mot_namn,t180`),
  ]);
  // 180:or totalt per person (eller okopplat namn) och flest i en turnering
  const tot = new Map();
  for (const r of t180rader) {
    const k = r.spelare_id ? `s${r.spelare_id}` : `n${r.namn}`;
    const x = tot.get(k) ?? { namn: r.namn, spelare_id: r.spelare_id, t180: 0, turneringar: 0 };
    x.t180 += r.t180; x.turneringar++; tot.set(k, x);
  }
  const t180tot = [...tot.values()].sort((a, b) => b.t180 - a.t180).slice(0, n);
  const t180turn = [...t180rader].sort((a, b) => b.t180 - a.t180).slice(0, n);
  const tnamn = (tdid) => { const t = T[tdid] ?? {}; return `${t.serie ?? t.titel ?? ''}${t.omgang ? ` ${t.omgang}` : ''}`; };
  return { T, tnamn, legs, utg, match, turnSnitt, t180tot, t180turn, match180, antalTurn: turn.length };
}

// Namn: kopplad person visas med registrets namn i länken (spelarlank), annars n01-namnet
const vem = (r) => spelarlank(r.namn, r.spelare_id);

export function rekordKort(R) {
  const { tnamn } = R;
  const i = (r) => `${esc(r.datum ?? R.T[r.tdid]?.datum ?? '')} · ${esc(tnamn(r.tdid))}`;
  return [
    ['Bästa leg', 'Minst antal pilar i ett vunnet 501-leg – och därmed högsta legsnitt', R.legs,
      (r) => `<b>${r.pilar} pilar</b> <small class="muted">(${fmt(r.snitt, 2)})</small>`, (r) => `<a href="${mlank(r.mid)}">mot ${esc(r.mot_namn ?? '?')}</a>, ${i(r)}`],
    ['Högsta utgång', 'Utcheckning i ett 501-leg', R.utg,
      (r) => `<b>${r.utgang}</b>`, (r) => `<a href="${mlank(r.mid)}">mot ${esc(r.mot_namn ?? '?')}</a>, ${i(r)}`],
    ['Högsta snitt i en match', '3-pilssnitt i en match', R.match,
      (r) => `<b>${fmt(r.snitt, 2)}</b>`, (r) => `<a href="${mlank(r.mid)}">${r.legs_vunna}–${r.legs_forlorade} mot ${esc(r.mot_namn ?? '?')}</a>, ${i(r)}`],
    ['Högsta snitt i en turnering', '3-pilssnitt, minst 3 matcher', R.turnSnitt,
      (r) => `<b>${fmt(r.snitt, 2)}</b>`, (r) => `<a href="${tlank(r.tdid)}">${i(r)}</a> · ${r.matcher} matcher`],
    ['Flest 180:or totalt', 'Alla 501-turneringar', R.t180tot,
      (r) => `<b>${r.t180}</b>`, (r) => `${r.turneringar} turneringar`],
    ['Flest 180:or i en turnering', '', R.t180turn,
      (r) => `<b>${r.t180}</b>`, (r) => `<a href="${tlank(r.tdid)}">${i(r)}</a>`],
    ['Flest 180:or i en match', '', R.match180,
      (r) => `<b>${r.t180}</b>`, (r) => `<a href="${mlank(r.mid)}">mot ${esc(r.mot_namn ?? '?')}</a>, ${i(r)}`],
  ];
}

export async function visaRekord(app) {
  const R = await hamtaRekord();
  app.innerHTML = `
    <h1>Klubbrekord</h1>
    <p class="muted">Rekorden på 501 i klubbens ${R.antalTurn} turneringar (torsdagarna) – topp ${N} i varje gren. Tryck på en rad för att se matchen eller turneringen.</p>
    <div class="rekordsida">${rekordKort(R).map(([titel, under, rader, varde, info]) => `<div class="kort rekordlista">
      <h2>${titel}</h2>${under ? `<p class="muted liten">${under}</p>` : ''}
      ${rader.length ? `<ol>${rader.map((r) => `<li><span class="varde">${varde(r)}</span> <span class="vem">${vem(r)}</span><br><small class="muted">${info(r)}</small></li>`).join('')}</ol>` : '<p class="muted">Inga än.</p>'}
    </div>`).join('')}</div>
    <p class="muted liten">Bästa leg räknar bara legs som vunnits med pilar (inte avgjorda med närmast bull). Legsnittet för ett vunnet 501-leg är 3 × 501 / antal pilar, så bästa leg och högsta legsnitt är samma lista. 301 och handikapp ingår inte – se spelarsidan för dem.</p>`;
}
