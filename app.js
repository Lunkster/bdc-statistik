// Router och inloggning
import { login, logout, isLoggedIn, arAdmin, esc } from './lib.js?v=0.2.0';
import { visaTurneringar } from './turneringar.js?v=0.2.0';
import { visaTurnering } from './turnering.js?v=0.2.0';
import { visaSpelare, visaNamn, visaSpelarlista } from './spelare.js?v=0.2.0';
import { visaAdmin } from './admin.js?v=0.2.0';
import { visaMatch } from './match.js?v=0.2.0';

const app = document.getElementById('app');

function visaLogin(meddelande = '') {
  document.body.classList.add('utloggad');
  app.innerHTML = `
    <form class="kort login" id="login">
      <img src="emblem.png?v=0.2.0" alt="Dart Club Bankeryd" class="emblem">
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
  document.body.classList.remove('utloggad');
  const [, vy, arg] = (location.hash || '#/').split('/');
  const flik = { turnering: 'turneringar', match: 'turneringar', namn: 'spelare', '': 'turneringar' }[vy ?? ''] ?? vy;
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('aktiv', a.dataset.route === flik));
  document.getElementById('adminlank').hidden = !arAdmin();
  document.getElementById('loggaut').hidden = false;
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  window.scrollTo(0, 0);
  try {
    if (vy === 'loggaut') { logout(); location.hash = '#/'; return visaLogin(); }
    if (vy === 'turnering') return await visaTurnering(app, decodeURIComponent(arg));
    if (vy === 'spelare' && arg) return await visaSpelare(app, Number(arg));
    if (vy === 'spelare') return await visaSpelarlista(app);
    if (vy === 'match') return await visaMatch(app, decodeURIComponent(arg));
    if (vy === 'namn') return await visaNamn(app, decodeURIComponent(arg));
    if (vy === 'admin') return await visaAdmin(app);
    return await visaTurneringar(app);
  } catch (e) {
    if (e.status === 401) return visaLogin('Logga in igen.');
    app.innerHTML = `<p class="fel">Något gick fel: ${esc(e.message)}</p>`;
  }
}

window.addEventListener('hashchange', route);
route();
