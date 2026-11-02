// Matchsida: resultat, statistik (med Detaljer) och protokoll per leg som n01
import { api, esc, spelarlank } from './lib.js?v=0.10.2';
import { rakna, statistikHtml, legsHtml, protokollSida, koppla } from './protokoll.js?v=0.10.2';

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

  // Statistik ur rundorna (som n01); finns inga rundor används vyns siffror
  const stat = (s, sida) => (s ? rakna(kast, legs, sida, s.legs_vunna) ?? {
    legs: s.legs_vunna, snitt: s.snitt, f9: s.snitt_f9, t100k: s.t100, t140k: (s.t140 ?? 0) + (s.t170 ?? 0), t180: s.t180,
    utgang: s.hogsta_utgang, basta: s.basta_leg, pilarPerLeg: s.pilar_per_leg, hogsta: s.hogsta_runda,
  } : null);

  app.innerHTML = `
    <p><a href="#/tavling/${encodeURIComponent(a.tdid)}" class="tillbaka">← ${esc(t?.serie ?? t?.titel ?? 'Tävlingen')}${t?.omgang ? ` omg ${t.omgang}` : ''}</a></p>
    <h1>Match</h1>
    <p class="muted">${esc(t?.datum ?? '')} · ${fas}</p>
    <div class="kort matchhuvud">
      <span class="${a.vann ? 'vinst' : ''}">${namn(a)}</span>
      <b class="resultat stor">${a.legs_vunna}–${b?.legs_vunna ?? 0}</b>
      <span class="${b?.vann ? 'vinst' : ''}">${namn(b)}</span>
    </div>
    ${protokollSida(statistikHtml(a.namn, b?.namn ?? '', stat(a, 0), stat(b, 1)), legsHtml(legs, kast, (x) => (x === 0 ? a.namn : b?.namn ?? '')))}`;
  koppla(app);
}
