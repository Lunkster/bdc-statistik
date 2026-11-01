// Router och inloggning
import { login, logout, isLoggedIn, arAdmin, esc, laddaBilder } from './lib.js?v=0.9.7';
import { visaTavlingar } from './tavlingar.js?v=0.9.7';
import { visaTavling } from './tavling.js?v=0.9.7';
import { visaSpelare, visaNamn, visaSpelarlista } from './spelare.js?v=0.9.7';
import { visaAdmin } from './admin.js?v=0.9.7';
import { visaMatch } from './match.js?v=0.9.7';
import { visaNyheter } from './nyheter.js?v=0.9.7';
import { visaCuper, visaCup } from './cuper.js?v=0.9.7';
import { visaSerien, visaLagmatch, visaDsMatch } from './serien.js?v=0.9.7';
import { visaRekord } from './rekord.js?v=0.9.7';
import { visaKarusellSida } from './karusell.js?v=0.9.7';

const app = document.getElementById('app');

function visaLogin(meddelande = '') {
  document.body.classList.add('utloggad');
  app.innerHTML = `
    <form class="kort login" id="login">
      <img src="emblem.png?v=0.9.7" alt="Dart Club Bankeryd" class="emblem">
      <h1>Klubbstatistik</h1>
      <label>Klubbkod <input type="password" name="kod" autocomplete="current-password" required></label>
      <label class="rad"><input type="checkbox" name="admin"> Logga in som admin</label>
      <button class="btn">Logga in</button>
      <p class="fel" role="alert">${esc(meddelande)}</p>
    </form>`;
  document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    f.querySelector('button').disabled = true;
    const ok = await login(f.kod.value, f.admin.checked);
    if (ok) { location.hash = location.hash || '#/'; route(); } else visaLogin('Fel kod.');
  });
}

async function route() {
  if (!isLoggedIn()) return visaLogin();
  document.body.classList.remove('utloggad', 'tv');
  const [, vy, arg, ...resten] = (location.hash || '#/').split('/');
  const flik = { tavling: 'tavlingar', turnering: 'tavlingar', match: 'tavlingar', namn: 'spelare', cup: 'cuper', karusell: 'tavlingar', lagmatch: 'serien', dsmatch: 'serien', '': 'tavlingar' }[vy ?? ''] ?? vy;
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('aktiv', a.dataset.route === flik));
  document.getElementById('adminlank').hidden = !arAdmin();
  document.getElementById('loggaut').hidden = false;
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  window.scrollTo(0, 0);
  try {
    if (vy === 'loggaut') { logout(); location.hash = '#/'; return visaLogin(); }
    await laddaBilder().catch(() => {});   // porträtt (cachas en knapp timme)
    if (vy === 'turnering') { location.replace(`#/tavling/${arg}`); return; }   // gamla länkar (före v0.9.1)
    if (vy === 'tavling') return await visaTavling(app, decodeURIComponent(arg));
    if (vy === 'spelare' && arg) return await visaSpelare(app, Number(arg));
    if (vy === 'spelare') return await visaSpelarlista(app);
    if (vy === 'cuper') return await visaCuper(app);
    if (vy === 'cup') return await visaCup(app, Number(arg));
    if (vy === 'serien') return await visaSerien(app, arg ? decodeURIComponent(arg) : null);
    if (vy === 'lagmatch') return await visaLagmatch(app, decodeURIComponent(arg), decodeURIComponent(resten[0] ?? ''));
    if (vy === 'dsmatch') return await visaDsMatch(app, decodeURIComponent(arg));
    if (vy === 'rekord') return await visaRekord(app);
    if (vy === 'karusell') return await visaKarusellSida(app);
    if (vy === 'nyheter') return await visaNyheter(app);
    if (vy === 'match') return await visaMatch(app, decodeURIComponent(arg));
    if (vy === 'namn') return await visaNamn(app, decodeURIComponent(arg));
    if (vy === 'admin') return await visaAdmin(app, arg, resten.map(decodeURIComponent).join('/'));
    return await visaTavlingar(app);
  } catch (e) {
    if (e.status === 401) return visaLogin('Logga in igen.');
    app.innerHTML = `<p class="fel">Något gick fel: ${esc(e.message)}</p>`;
  }
}

window.addEventListener('hashchange', route);
route();
