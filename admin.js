// Admin v0.1: hämta nu, hämtlogg, okopplade namn (kopplingarna görs på adminsidan i v0.3)
import { api, funktion, esc, datumTid, arAdmin } from './lib.js?v=0.2.0';

export async function visaAdmin(app) {
  if (!arAdmin()) { app.innerHTML = '<p class="fel">Bara för admin.</p>'; return; }
  const [logg, okopplade] = await Promise.all([
    api('hamtning?select=*&order=id.desc&limit=10'),
    api('v_deltagare?spelare_id=is.null&select=namn'),
  ]);
  const antal = {};
  okopplade.forEach((d) => { antal[d.namn] = (antal[d.namn] ?? 0) + 1; });
  const namn = Object.entries(antal).sort((a, b) => b[1] - a[1]);

  app.innerHTML = `
    <h1>Admin</h1>
    <div class="kort">
      <h2>Hämta från n01</h2>
      <p class="muted liten">Sker automatiskt torsdag och söndag kl. 23:00. Knappen hämtar nya och ändrade turneringar direkt (tar upp till två minuter).</p>
      <button class="btn" id="hamta">Hämta nu</button>
      <p id="hamtsvar" role="status"></p>
    </div>
    <h2>Senaste hämtningar</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Start</th><th>Hur</th><th>Status</th><th>Turneringar</th><th>Matcher</th><th>Meddelande</th></tr></thead>
      <tbody>${logg.map((h) => `<tr><td class="fast">${datumTid(h.start)}</td><td>${esc(h.kalla)}</td><td>${esc(h.status)}</td>
        <td>${h.nya_turneringar}</td><td>${h.nya_matcher}</td><td class="liten">${esc(h.meddelande ?? '')}</td></tr>`).join('')}</tbody>
    </table></div>
    <h2>Okopplade namn</h2>
    <p class="muted liten">${namn.length} namn från n01 är inte kopplade till en person. Kopplingar görs här i nästa version – tills vidare via Claude.</p>
    <p>${namn.map(([n, a]) => `<a href="#/namn/${encodeURIComponent(n)}" class="chip">${esc(n)} <small>${a}</small></a>`).join(' ')}</p>`;

  document.getElementById('hamta').addEventListener('click', async (e) => {
    const svar = document.getElementById('hamtsvar');
    e.target.disabled = true; svar.textContent = 'Hämtar …';
    try {
      const r = await funktion('hamta', { kalla: 'knapp' });
      svar.textContent = `Klart: ${r.turneringar} nya eller ändrade turneringar, ${r.matcher} matcher.${r.klart ? '' : ` Tidsgränsen nåddes – ${r.kvar} kvar, tryck igen.`}`;
    } catch (err) {
      svar.textContent = `Fel: ${err.message}`;
    } finally { e.target.disabled = false; }
  });
}
