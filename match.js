// Matchsida: resultat, statistik per spelare och varje leg runda för runda
import { api, esc, fmt, spelarlank } from './lib.js?v=0.3.1';

export async function visaMatch(app, mid) {
  const q = encodeURIComponent(mid);
  const [sidor, legs, kast] = await Promise.all([
    api(`v_spelare_match?mid=eq.${q}&select=*&order=sida`),
    api(`leg?mid=eq.${q}&select=nr,forst,vinnare,mfd&order=nr`),
    api(`kast?mid=eq.${q}&select=leg_nr,sida,runda,poang,kvar,pilar,utgang&order=leg_nr,runda,sida`),
  ]);
  if (!sidor.length) { app.innerHTML = '<p class="fel">Matchen finns inte.</p>'; return; }
  const [a, b] = [sidor.find((s) => s.sida === 0), sidor.find((s) => s.sida === 1)];
  const [[t]] = await Promise.all([api(`v_turnering?tdid=eq.${encodeURIComponent(a.tdid)}&select=tdid,datum,serie,omgang,titel`)]);
  const fas = a.ttype === 'rr' ? `Gruppspel` : a.ttype === 't3' ? 'Bronsmatch' : 'Slutspel';
  const namn = (s) => (s ? spelarlank(s.namn, s.spelare_id) : '–');

  const rader = [
    ['Legs', (s) => s.legs_vunna], ['3-pilssnitt', (s) => fmt(s.snitt, 2)], ['First 9', (s) => fmt(s.snitt_f9, 2)],
    ['Pilar per vunnet leg', (s) => fmt(s.pilar_per_leg, 1)], ['Bästa leg', (s) => s.basta_leg ?? '–'],
    ['Högsta runda', (s) => s.hogsta_runda ?? '–'], ['Högsta utgång', (s) => s.hogsta_utgang ?? '–'],
    ['100+', (s) => s.t100 ?? 0], ['140+', (s) => s.t140 ?? 0], ['170+', (s) => s.t170 ?? 0], ['180', (s) => s.t180 ?? 0],
  ];

  const legHtml = legs.map((l) => {
    const k = kast.filter((x) => x.leg_nr === l.nr);
    const sida = (s) => k.filter((x) => x.sida === s);
    const pilar = (s) => sida(s).reduce((sum, x) => sum + x.pilar, 0);
    const vinnare = l.vinnare === 0 ? a : l.vinnare === 1 ? b : null;
    const runda = (x) => `<span class="runda${x.utgang ? ' ut' : ''}${x.poang >= 100 ? ' hog' : ''}" title="Kvar ${x.kvar}">${x.poang}</span>`;
    return `<div class="kort leg">
      <h3>Leg ${l.nr + 1} <span class="muted liten">· ${esc((l.forst === 1 ? b : a)?.namn ?? '')} började${vinnare ? ` · vinst ${esc(vinnare.namn)}` : ''}${l.mfd ? ' · avgjort med närmast bull' : ''}</span></h3>
      <div class="legsida"><span class="muted">${esc(a.namn)}</span><span class="rundor">${sida(0).map(runda).join('')}</span><small class="muted">${pilar(0)} pilar</small></div>
      ${b ? `<div class="legsida"><span class="muted">${esc(b.namn)}</span><span class="rundor">${sida(1).map(runda).join('')}</span><small class="muted">${pilar(1)} pilar</small></div>` : ''}
    </div>`;
  }).join('');

  app.innerHTML = `
    <p><a href="#/turnering/${encodeURIComponent(a.tdid)}" class="tillbaka">← ${esc(t?.serie ?? t?.titel ?? 'Turneringen')}${t?.omgang ? ` omg ${t.omgang}` : ''}</a></p>
    <h1>Match</h1>
    <p class="muted">${esc(t?.datum ?? '')} · ${fas}</p>
    <div class="kort matchhuvud">
      <span class="${a.vann ? 'vinst' : ''}">${namn(a)}</span>
      <b class="resultat stor">${a.legs_vunna}–${b?.legs_vunna ?? 0}</b>
      <span class="${b?.vann ? 'vinst' : ''}">${namn(b)}</span>
    </div>
    <div class="rulla"><table class="tabell jamfor">
      <thead><tr><th>${esc(a.namn)}</th><th></th><th>${esc(b?.namn ?? '')}</th></tr></thead>
      <tbody>${rader.map(([n, f]) => `<tr><td>${f(a)}</td><td class="muted">${n}</td><td>${b ? f(b) : ''}</td></tr>`).join('')}</tbody>
    </table></div>
    <h2>Legs</h2>
    <p class="muted liten">Varje runda = tre pilar. Rosa = 100 eller mer, mint = utgång.</p>
    ${legHtml}`;
}
