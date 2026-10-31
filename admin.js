// Admin: hämtning, koppla namn (allmänt eller per turnering), spelarregister, slå ihop, ändringslogg
import { api, skriv, rpc, funktion, esc, fmt, datumTid, arAdmin } from './lib.js?v=0.3.1';

const flikar = [['', 'Översikt'], ['namn', 'Koppla namn'], ['spelare', 'Spelarregister'], ['logg', 'Ändringslogg']];
const meny = (aktiv) => `<div class="filter" role="navigation" aria-label="Admin">${flikar.map(([k, n]) =>
  `<a class="chip${k === aktiv ? ' vald' : ''}" href="#/admin${k ? `/${k}` : ''}">${n}</a>`).join('')}</div>`;
const spNamn = (s) => (s ? (s.visningsnamn && s.visningsnamn !== s.namn ? `${s.namn} (${s.visningsnamn})` : s.namn) : '–');
const sortSp = (a, b) => a.namn.localeCompare(b.namn, 'sv');
const val = (spelare, vald, tom = '– välj spelare –') => `<option value="">${tom}</option>${spelare.map((s) =>
  `<option value="${s.id}"${s.id === vald ? ' selected' : ''}>${esc(spNamn(s))}</option>`).join('')}`;
const fel = (app, e) => { const p = app.querySelector('.svar'); if (p) p.textContent = `Fel: ${e.message}`; };

export async function visaAdmin(app, del, arg) {
  if (!arAdmin()) { app.innerHTML = '<p class="fel">Bara för admin.</p>'; return; }
  if (del === 'namn' && arg) return visaNamnKoppling(app, arg);
  if (del === 'namn') return visaNamnlista(app);
  if (del === 'spelare') return visaRegister(app);
  if (del === 'logg') return visaLogg(app);
  return visaOversikt(app);
}

// ---------- översikt: hämtning ----------
async function visaOversikt(app) {
  const [logg, delt] = await Promise.all([
    api('hamtning?select=*&order=id.desc&limit=10'),
    api('v_deltagare?select=spelare_id'),
  ]);
  const kopplade = delt.filter((d) => d.spelare_id).length;
  app.innerHTML = `
    <h1>Admin</h1>${meny('')}
    <div class="nyckeltal"><div class="kort"><span class="muted">Kopplade deltaganden</span><b>${Math.round((100 * kopplade) / (delt.length || 1))} %</b></div>
      <div class="kort"><span class="muted">Okopplade</span><b><a href="#/admin/namn">${delt.length - kopplade}</a></b></div></div>
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
    </table></div>`;
  document.getElementById('hamta').addEventListener('click', async (e) => {
    const svar = document.getElementById('hamtsvar');
    e.target.disabled = true; svar.textContent = 'Hämtar …';
    try {
      const r = await funktion('hamta', { kalla: 'knapp' });
      svar.textContent = `Klart: ${r.turneringar} nya eller ändrade turneringar, ${r.matcher} matcher.${r.klart ? '' : ` Tidsgränsen nåddes – ${r.kvar} kvar, tryck igen.`}`;
    } catch (err) { svar.textContent = `Fel: ${err.message}`; } finally { e.target.disabled = false; }
  });
}

// ---------- alla n01-namn ----------
async function visaNamnlista(app) {
  const [delt, spelare, alias] = await Promise.all([
    api('v_deltagare?select=namn,spelare_id,tdid'),
    api('spelare?select=id,namn,visningsnamn'),
    api('alias?select=n01_namn,tdid'),
  ]);
  const sp = Object.fromEntries(spelare.map((s) => [s.id, s]));
  const perTurn = new Set(alias.filter((a) => a.tdid).map((a) => a.n01_namn.trim().toLowerCase()));
  const namn = new Map();
  for (const d of delt) {
    const k = d.namn.trim().toLowerCase();
    const n = namn.get(k) ?? { namn: d.namn, antal: 0, okopplade: 0, personer: new Set() };
    n.antal++; if (!d.spelare_id) n.okopplade++; else n.personer.add(d.spelare_id);
    namn.set(k, n);
  }
  const lista = [...namn.values()].sort((a, b) => (b.okopplade > 0) - (a.okopplade > 0) || b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));
  const okopplade = lista.filter((n) => n.okopplade);
  const rad = (n) => `<tr><td class="fast"><a href="#/admin/namn/${encodeURIComponent(n.namn)}">${esc(n.namn)}</a></td><td>${n.antal}</td>
    <td>${n.okopplade ? `<span class="varning">${n.okopplade} okopplade</span>` : ''}</td>
    <td>${[...n.personer].map((id) => `<a href="#/spelare/${id}">${esc(sp[id]?.namn ?? id)}</a>`).join(', ')}${perTurn.has(n.namn.trim().toLowerCase()) ? ' <small class="muted">(per turnering)</small>' : ''}</td></tr>`;
  app.innerHTML = `
    <h1>Koppla namn</h1>${meny('namn')}
    <p class="muted">Varje namn som stått i n01. Tryck på ett namn för att koppla det till en person – i alla turneringar eller bara i vissa. ${okopplade.length} namn har okopplade deltaganden.</p>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Namn i n01</th><th>Deltaganden</th><th></th><th>Kopplat till</th></tr></thead>
      <tbody>${lista.map(rad).join('')}</tbody></table></div>`;
}

// ---------- koppla ett namn ----------
async function visaNamnKoppling(app, namn) {
  const q = encodeURIComponent(namn);
  const [rader, spelare, alias] = await Promise.all([
    api(`v_namn_underlag?namn=ilike.${q}&select=*&order=datum.desc`),
    api('spelare?select=id,namn,visningsnamn,fornamn&aktiv=eq.true'),
    api(`alias?n01_namn=ilike.${q}&select=id,n01_namn,tdid,spelare_id`),
  ]);
  spelare.sort(sortSp);
  const sp = Object.fromEntries(spelare.map((s) => [s.id, s]));
  const allmant = alias.find((a) => !a.tdid);
  const perTurn = Object.fromEntries(alias.filter((a) => a.tdid).map((a) => [a.tdid, a]));

  // Kandidater: spelare vars namn börjar som n01-namnet + de som redan är kopplade
  const bas = namn.trim().toLowerCase().replace(/[^a-zåäö]/g, '').slice(0, 3);
  const kand = new Set(spelare.filter((s) => [s.namn, s.visningsnamn, s.fornamn].some((x) => (x ?? '').toLowerCase().startsWith(bas))).map((s) => s.id));
  rader.forEach((r) => r.spelare_id && kand.add(r.spelare_id));
  const kandIds = [...kand];
  const tdids = rader.map((r) => r.tdid);
  const [delt, statistik] = await Promise.all([
    kandIds.length && tdids.length ? api(`v_deltagare?tdid=in.(${tdids.map((t) => `"${t}"`).join(',')})&spelare_id=in.(${kandIds.join(',')})&select=tdid,spelare_id,namn`) : [],
    kandIds.length ? api(`v_turnering_statistik?spelare_id=in.(${kandIds.join(',')})&select=spelare_id,poang,pilar`) : [],
  ]);
  const snitt = {};
  for (const s of statistik) { const x = snitt[s.spelare_id] ?? { p: 0, d: 0, t: 0 }; x.p += s.poang ?? 0; x.d += s.pilar ?? 0; x.t++; snitt[s.spelare_id] = x; }
  const egetNamn = namn.trim().toLowerCase();
  // Vilka kandidater var med i turneringen under ett annat namn (kan då inte vara samma person)
  const medSamtidigt = (tdid) => delt.filter((d) => d.tdid === tdid && d.namn.trim().toLowerCase() !== egetNamn).map((d) => d.spelare_id);

  const kandHtml = kandIds.map((id) => {
    const x = snitt[id];
    return `<li>${esc(spNamn(sp[id]))} <small class="muted">${x ? `${x.t} turneringar, snitt ${fmt((3 * x.p) / (x.d || 1), 1)}` : 'inga turneringar ännu'}</small></li>`;
  }).join('');

  const radHtml = rader.map((r) => {
    const har = perTurn[r.tdid];
    const krock = medSamtidigt(r.tdid);
    const nu = r.spelare_id ? sp[r.spelare_id] : null;
    return `<tr data-tdid="${esc(r.tdid)}">
      <td class="fast"><a href="#/turnering/${encodeURIComponent(r.tdid)}">${esc(r.datum ?? '')}</a></td>
      <td>${esc(r.serie ?? '')}${r.omgang ? ` ${r.omgang}` : ''}</td>
      <td>${fmt(r.snitt, 1)}</td><td>${r.placering ?? '–'}</td>
      <td>${nu ? `${esc(nu.namn)} <small class="muted">${har ? 'bara här' : 'allmänt'}</small>` : '<span class="varning">okopplad</span>'}</td>
      <td class="liten muted">${krock.length ? `Med samma dag: ${krock.map((id) => esc(sp[id]?.namn ?? id)).join(', ')} – kan inte vara ${krock.length > 1 ? 'dem' : 'hen'}` : ''}</td>
      <td class="atgard"><select class="valj-har" aria-label="Koppla i den här turneringen">${val(spelare, har?.spelare_id, allmant ? '– som allmänt –' : '– ingen –')}</select>
        <button class="btn liten spara-har" type="button">Spara</button></td>
    </tr>`;
  }).join('');

  app.innerHTML = `
    <p><a href="#/admin/namn" class="tillbaka">← Koppla namn</a></p>
    <h1>${esc(namn)}</h1>${meny('namn')}
    <p class="muted">${rader.length} deltaganden i n01 under namnet. Koppla allmänt om namnet alltid är samma person; koppla per turnering om det skiljer. En koppling per turnering går före den allmänna.</p>
    <div class="kort">
      <h2>Allmän koppling</h2>
      <p>${allmant ? `Kopplat till <a href="#/spelare/${allmant.spelare_id}">${esc(sp[allmant.spelare_id]?.namn ?? '?')}</a> i alla turneringar.` : 'Inte kopplat allmänt.'}</p>
      <div class="formrad"><select id="allman">${val(spelare, allmant?.spelare_id)}</select>
        <button class="btn" id="spara-allman" type="button">${allmant ? 'Koppla om' : 'Koppla'}</button>
        ${allmant ? '<button class="btn sekundar" id="ta-bort-allman" type="button">Ta bort kopplingen</button>' : ''}</div>
      <details><summary>Ny spelare</summary>
        <div class="formrad"><input id="ny-fornamn" placeholder="Förnamn" value="${esc(namn.split(' ')[0])}"><input id="ny-efternamn" placeholder="Efternamn">
          <button class="btn" id="skapa" type="button">Skapa och koppla allmänt</button></div></details>
      <p class="svar" role="status"></p>
    </div>
    ${kandIds.length ? `<h2>Möjliga personer</h2><ul class="kandidater">${kandHtml}</ul>` : ''}
    <h2>Per turnering</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Datum</th><th>Turnering</th><th>Snitt</th><th>Plac</th><th>Kopplat till</th><th>Underlag</th><th>Koppla här</th></tr></thead>
      <tbody>${radHtml}</tbody></table></div>`;

  const om = () => visaNamnKoppling(app, namn);
  const kor = async (f) => { try { await f(); await om(); app.querySelector('.svar').textContent = 'Sparat.'; } catch (e) { fel(app, e); } };
  app.querySelector('#spara-allman').addEventListener('click', () => kor(async () => {
    const id = Number(app.querySelector('#allman').value); if (!id) throw new Error('Välj en spelare');
    if (allmant) await skriv('PATCH', `alias?id=eq.${allmant.id}`, { spelare_id: id });
    else await skriv('POST', 'alias', { n01_namn: namn, tdid: null, spelare_id: id });
  }));
  app.querySelector('#ta-bort-allman')?.addEventListener('click', () => kor(() => skriv('DELETE', `alias?id=eq.${allmant.id}`)));
  app.querySelector('#skapa').addEventListener('click', () => kor(async () => {
    const fornamn = app.querySelector('#ny-fornamn').value.trim(), efternamn = app.querySelector('#ny-efternamn').value.trim();
    if (!fornamn) throw new Error('Skriv ett förnamn');
    const [ny] = await skriv('POST', 'spelare', { namn: `${fornamn} ${efternamn}`.trim(), fornamn, efternamn, visningsnamn: null });
    if (allmant) await skriv('PATCH', `alias?id=eq.${allmant.id}`, { spelare_id: ny.id });
    else await skriv('POST', 'alias', { n01_namn: namn, tdid: null, spelare_id: ny.id });
  }));
  app.querySelectorAll('.spara-har').forEach((b) => b.addEventListener('click', () => kor(async () => {
    const tr = b.closest('tr'), tdid = tr.dataset.tdid, id = Number(tr.querySelector('.valj-har').value), har = perTurn[tdid];
    if (!id && har) await skriv('DELETE', `alias?id=eq.${har.id}`);
    else if (id && har) await skriv('PATCH', `alias?id=eq.${har.id}`, { spelare_id: id });
    else if (id) await skriv('POST', 'alias', { n01_namn: namn, tdid, spelare_id: id });
  })));
}

// ---------- spelarregister ----------
async function visaRegister(app) {
  const [spelare, alias] = await Promise.all([
    api('spelare?select=*'), api('alias?select=n01_namn,tdid,spelare_id'),
  ]);
  spelare.sort(sortSp);
  const namnPa = (id) => [...new Set(alias.filter((a) => a.spelare_id === id).map((a) => a.n01_namn + (a.tdid ? '*' : '')))];
  app.innerHTML = `
    <h1>Spelarregister</h1>${meny('spelare')}
    <p class="muted">${spelare.length} spelare. Ändra och tryck Spara på raden. Fullständigt namn = förnamn + efternamn. * = kopplat bara i vissa turneringar.</p>
    <details class="kort"><summary>Ny spelare</summary>
      <div class="formrad"><input id="ny-fornamn" placeholder="Förnamn"><input id="ny-efternamn" placeholder="Efternamn"><input id="ny-nr" placeholder="Medlemsnummer">
        <button class="btn" id="skapa" type="button">Skapa</button></div></details>
    <p class="svar" role="status"></p>
    <div class="rulla"><table class="tabell register">
      <thead><tr><th class="fast">Förnamn</th><th>Efternamn</th><th>Visas som</th><th>Medlemsnr</th><th>Aktiv</th><th>Heter i n01</th><th></th><th>Slå ihop med</th></tr></thead>
      <tbody>${spelare.map((s) => `<tr data-id="${s.id}">
        <td class="fast"><input name="fornamn" value="${esc(s.fornamn ?? '')}" aria-label="Förnamn"></td>
        <td><input name="efternamn" value="${esc(s.efternamn ?? '')}" aria-label="Efternamn"></td>
        <td><input name="visningsnamn" value="${esc(s.visningsnamn ?? '')}" aria-label="Visas som"></td>
        <td><input name="medlemsnummer" value="${esc(s.medlemsnummer ?? '')}" aria-label="Medlemsnummer" class="kort-falt"></td>
        <td><input type="checkbox" name="aktiv"${s.aktiv ? ' checked' : ''} aria-label="Aktiv"></td>
        <td class="liten">${namnPa(s.id).map((n) => `<a href="#/admin/namn/${encodeURIComponent(n.replace('*', ''))}">${esc(n)}</a>`).join(', ')}</td>
        <td><button class="btn liten spara" type="button">Spara</button> <a href="#/spelare/${s.id}" class="liten">Visa</a></td>
        <td><select class="ihop" aria-label="Slå ihop med">${val(spelare.filter((x) => x.id !== s.id), null, '–')}</select>
          <button class="btn liten sekundar sla-ihop" type="button">Slå ihop</button></td>
      </tr>`).join('')}</tbody></table></div>`;

  const svar = app.querySelector('.svar');
  const kor = async (f, text) => { try { await f(); await visaRegister(app); app.querySelector('.svar').textContent = text; } catch (e) { svar.textContent = `Fel: ${e.message}`; } };
  app.querySelector('#skapa').addEventListener('click', () => kor(async () => {
    const fornamn = app.querySelector('#ny-fornamn').value.trim(); if (!fornamn) throw new Error('Skriv ett förnamn');
    const efternamn = app.querySelector('#ny-efternamn').value.trim();
    await skriv('POST', 'spelare', { namn: `${fornamn} ${efternamn}`.trim(), fornamn, efternamn, medlemsnummer: app.querySelector('#ny-nr').value });
  }, 'Spelaren skapad.'));
  app.querySelectorAll('.spara').forEach((b) => b.addEventListener('click', () => {
    const tr = b.closest('tr'), f = (n) => tr.querySelector(`[name=${n}]`);
    kor(() => skriv('PATCH', `spelare?id=eq.${tr.dataset.id}`, {
      fornamn: f('fornamn').value, efternamn: f('efternamn').value, visningsnamn: f('visningsnamn').value.trim() || null,
      medlemsnummer: f('medlemsnummer').value, aktiv: f('aktiv').checked,
    }), 'Sparat.');
  }));
  app.querySelectorAll('.sla-ihop').forEach((b) => b.addEventListener('click', () => {
    const tr = b.closest('tr'), fran = Number(tr.dataset.id), till = Number(tr.querySelector('.ihop').value);
    if (!till) { svar.textContent = 'Välj vem spelaren ska slås ihop med.'; return; }
    const a = spelare.find((s) => s.id === fran)?.namn, c = spelare.find((s) => s.id === till)?.namn;
    if (!window.confirm(`Slå ihop ${a} med ${c}? Alla kopplingar flyttas till ${c} och ${a} tas bort.`)) return;
    kor(() => rpc('sla_ihop_spelare', { fran, till }), `${a} är ihopslagen med ${c}.`);
  }));
}

// ---------- ändringslogg ----------
async function visaLogg(app) {
  const [logg, spelare] = await Promise.all([api('alias_logg?select=*&order=id.desc&limit=200'), api('spelare?select=id,namn')]);
  const sp = Object.fromEntries(spelare.map((s) => [s.id, s.namn]));
  const namn = (id) => (id ? esc(sp[id] ?? `borttagen spelare ${id}`) : '');
  app.innerHTML = `
    <h1>Ändringslogg</h1>${meny('logg')}
    <p class="muted">Kopplingar som gjorts, flyttats eller tagits bort (senaste 200).</p>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Tid</th><th>Händelse</th><th>Namn i n01</th><th>Gäller</th><th>Från</th><th>Till</th></tr></thead>
      <tbody>${logg.map((l) => `<tr><td class="fast">${datumTid(l.tid)}</td><td>${esc(l.handling)}</td><td>${esc(l.n01_namn ?? '')}</td>
        <td>${l.tdid ? `<a href="#/turnering/${encodeURIComponent(l.tdid)}">en turnering</a>` : 'alla'}</td><td>${namn(l.fran_spelare)}</td><td>${namn(l.till_spelare)}</td></tr>`).join('')}</tbody>
    </table></div>`;
}
