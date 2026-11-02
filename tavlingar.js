// Tävlingslistan: alla tävlingar, nyast först, filter på serie
import { api, esc } from './lib.js?v=0.10.1';
import { visaKarusell } from './karusell.js?v=0.10.1';

let valdSerie = '';

export async function visaTavlingar(app) {
  const rader = await api('v_turnering?select=tdid,titel,datum,serie,omgang,deltagare,matcher,vinnare,vinnare_id&order=datum.desc,tdid.desc');
  const serier = [...new Set(rader.map((r) => r.serie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv'));

  const ritaLista = () => {
    const urval = rader.filter((r) => !valdSerie || r.serie === valdSerie);
    let manad = '';
    const html = urval.map((r) => {
      const m = (r.datum ?? '').slice(0, 7);
      const rubrik = m !== manad ? `<h2 class="manad">${esc(m || 'Utan datum')}</h2>` : '';
      manad = m;
      const namn = r.serie ? `${esc(r.serie)}${r.omgang ? ` <span class="muted">omg ${r.omgang}</span>` : ''}` : esc(r.titel);
      return `${rubrik}
        <a class="tavlingsrad" href="#/tavling/${encodeURIComponent(r.tdid)}">
          <span class="datum">${esc(r.datum ?? '')}</span>
          <span class="namn">${namn}</span>
          <span class="muted antal">${r.deltagare} spelare</span>
          <span class="vinnare">${r.vinnare ? `🏆 ${esc(r.vinnare)}` : ''}</span>
        </a>`;
    }).join('');
    document.getElementById('lista').innerHTML = html || '<p class="muted">Inga tävlingar.</p>';
  };

  app.innerHTML = `
    <div id="karusell"></div>
    <h1>Tävlingar</h1>
    <p class="muted">${rader.length} tävlingar sedan ${esc(rader.at(-1)?.datum ?? '')} – hämtas från n01 varje torsdag och söndag kl. 23:00.</p>
    <div class="filter" role="group" aria-label="Serie">
      <button type="button" data-serie="" class="chip">Alla</button>
      ${serier.map((s) => `<button type="button" data-serie="${esc(s)}" class="chip">${esc(s)}</button>`).join('')}
    </div>
    <div id="lista"></div>`;
  const markera = () => app.querySelectorAll('.chip').forEach((b) => b.classList.toggle('vald', b.dataset.serie === valdSerie));
  app.querySelector('.filter').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    valdSerie = b.dataset.serie; markera(); ritaLista();
  });
  markera(); ritaLista();
  visaKarusell(app.querySelector('#karusell')).catch(() => {});
}
