// Admin: hämtning, koppla namn (allmänt eller per tävling), spelarregister, slå ihop, ändringslogg
import { api, skriv, rpc, funktion, esc, fmt, datumTid, arAdmin } from './lib.js?v=0.9.3';
import { visaExport } from './export.js?v=0.9.3';

const flikar = [['', 'Översikt'], ['gora', 'Att göra'], ['namn', 'Koppla namn'], ['spelare', 'Spelarregister'], ['cuper', 'Cuper'], ['serien', 'Serien'], ['logg', 'Ändringslogg'], ['export', 'Export']];
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
  if (del === 'cuper' && arg) return visaCupAdmin(app, arg);
  if (del === 'cuper') return visaCupLista(app);
  if (del === 'gora') return visaAttGora(app);
  if (del === 'serien') return visaSerieAdmin(app);
  if (del === 'export') return visaExport(app, meny('export'));
  if (del === 'logg') return visaLogg(app);
  return visaOversikt(app);
}

// ---------- översikt: hämtning ----------
async function visaOversikt(app) {
  const [logg, delt, oppnaUppg] = await Promise.all([
    api('hamtning?select=*&order=id.desc&limit=10'),
    api('v_deltagare?select=spelare_id'),
    api('uppgift?select=id&status=eq.öppen'),
  ]);
  const kopplade = delt.filter((d) => d.spelare_id).length;
  app.innerHTML = `
    <h1>Admin</h1>${meny('')}
    <div class="nyckeltal"><div class="kort"><span class="muted">Kopplade deltaganden</span><b>${Math.round((100 * kopplade) / (delt.length || 1))} %</b></div>
      <div class="kort"><span class="muted">Okopplade</span><b><a href="#/admin/namn">${delt.length - kopplade}</a></b></div>
      <div class="kort"><span class="muted">Att göra</span><b><a href="#/admin/gora">${oppnaUppg.length}</a></b></div></div>
    <div class="kort">
      <h2>Hämta från n01</h2>
      <p class="muted liten">Sker automatiskt torsdag och söndag kl. 23:00. Knappen hämtar nya och ändrade tävlingar direkt (tar upp till två minuter).</p>
      <button class="btn" id="hamta">Hämta nu</button>
      <p id="hamtsvar" role="status"></p>
    </div>
    <h2>Senaste hämtningar</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Start</th><th>Hur</th><th>Status</th><th>Tävlingar</th><th>Matcher</th><th>Meddelande</th></tr></thead>
      <tbody>${logg.map((h) => `<tr><td class="fast">${datumTid(h.start)}</td><td>${esc(h.kalla)}</td><td>${esc(h.status)}</td>
        <td>${h.nya_turneringar}</td><td>${h.nya_matcher}</td><td class="liten">${esc(h.meddelande ?? '')}</td></tr>`).join('')}</tbody>
    </table></div>`;
  document.getElementById('hamta').addEventListener('click', async (e) => {
    const svar = document.getElementById('hamtsvar');
    e.target.disabled = true; svar.textContent = 'Hämtar …';
    try {
      const r = await funktion('hamta', { kalla: 'knapp' });
      svar.textContent = `Klart: ${r.turneringar} nya eller ändrade tävlingar, ${r.matcher} matcher.${r.klart ? '' : ` Tidsgränsen nåddes – ${r.kvar} kvar, tryck igen.`}`;
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
    <td>${[...n.personer].map((id) => `<a href="#/spelare/${id}">${esc(sp[id]?.namn ?? id)}</a>`).join(', ')}${perTurn.has(n.namn.trim().toLowerCase()) ? ' <small class="muted">(per tävling)</small>' : ''}</td></tr>`;
  app.innerHTML = `
    <h1>Koppla namn</h1>${meny('namn')}
    <p class="muted">Varje namn som stått i n01. Tryck på ett namn för att koppla det till en person – i alla tävlingar eller bara i vissa. ${okopplade.length} namn har okopplade deltaganden.</p>
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
  // Vilka kandidater var med i tävlingen under ett annat namn (kan då inte vara samma person)
  const medSamtidigt = (tdid) => delt.filter((d) => d.tdid === tdid && d.namn.trim().toLowerCase() !== egetNamn).map((d) => d.spelare_id);

  const kandHtml = kandIds.map((id) => {
    const x = snitt[id];
    return `<li>${esc(spNamn(sp[id]))} <small class="muted">${x ? `${x.t} tävlingar, snitt ${fmt((3 * x.p) / (x.d || 1), 1)}` : 'inga tävlingar ännu'}</small></li>`;
  }).join('');

  const radHtml = rader.map((r) => {
    const har = perTurn[r.tdid];
    const krock = medSamtidigt(r.tdid);
    const nu = r.spelare_id ? sp[r.spelare_id] : null;
    return `<tr data-tdid="${esc(r.tdid)}">
      <td class="fast"><a href="#/tavling/${encodeURIComponent(r.tdid)}">${esc(r.datum ?? '')}</a></td>
      <td>${esc(r.serie ?? '')}${r.omgang ? ` ${r.omgang}` : ''}</td>
      <td>${fmt(r.snitt, 1)}</td><td>${r.placering ?? '–'}</td>
      <td>${nu ? `${esc(nu.namn)} <small class="muted">${har ? 'bara här' : 'allmänt'}</small>` : '<span class="varning">okopplad</span>'}</td>
      <td class="liten muted">${krock.length ? `Med samma dag: ${krock.map((id) => esc(sp[id]?.namn ?? id)).join(', ')} – kan inte vara ${krock.length > 1 ? 'dem' : 'hen'}` : ''}</td>
      <td class="atgard"><select class="valj-har" aria-label="Koppla i den här tävlingen">${val(spelare, har?.spelare_id, allmant ? '– som allmänt –' : '– ingen –')}</select>
        <button class="btn liten spara-har" type="button">Spara</button></td>
    </tr>`;
  }).join('');

  app.innerHTML = `
    <p><a href="#/admin/namn" class="tillbaka">← Koppla namn</a></p>
    <h1>${esc(namn)}</h1>${meny('namn')}
    <p class="muted">${rader.length} deltaganden i n01 under namnet. Koppla allmänt om namnet alltid är samma person; koppla per tävling om det skiljer. En koppling per tävling går före den allmänna.</p>
    <div class="kort">
      <h2>Allmän koppling</h2>
      <p>${allmant ? `Kopplat till <a href="#/spelare/${allmant.spelare_id}">${esc(sp[allmant.spelare_id]?.namn ?? '?')}</a> i alla tävlingar.` : 'Inte kopplat allmänt.'}</p>
      <div class="formrad"><select id="allman">${val(spelare, allmant?.spelare_id)}</select>
        <button class="btn" id="spara-allman" type="button">${allmant ? 'Koppla om' : 'Koppla'}</button>
        ${allmant ? '<button class="btn sekundar" id="ta-bort-allman" type="button">Ta bort kopplingen</button>' : ''}</div>
      <details><summary>Ny spelare</summary>
        <div class="formrad"><input id="ny-fornamn" placeholder="Förnamn" value="${esc(namn.split(' ')[0])}"><input id="ny-efternamn" placeholder="Efternamn">
          <button class="btn" id="skapa" type="button">Skapa och koppla allmänt</button></div></details>
      <p class="svar" role="status"></p>
    </div>
    ${kandIds.length ? `<h2>Möjliga personer</h2><ul class="kandidater">${kandHtml}</ul>` : ''}
    <h2>Per tävling</h2>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Datum</th><th>Tävling</th><th>Snitt</th><th>Plac</th><th>Kopplat till</th><th>Underlag</th><th>Koppla här</th></tr></thead>
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
    <p class="muted">${spelare.length} spelare. Ändra och tryck Spara på raden. Fullständigt namn = förnamn + efternamn. * = kopplat bara i vissa tävlingar. Inaktiva spelare utan kopplade namn kan tas bort.</p>
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
        <td><button class="btn liten spara" type="button">Spara</button> <a href="#/spelare/${s.id}" class="liten">Visa</a>${!s.aktiv && !namnPa(s.id).length ? ' <button class="btn liten sekundar ta-bort" type="button">Ta bort</button>' : ''}</td>
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
  app.querySelectorAll('.ta-bort').forEach((b) => b.addEventListener('click', () => {
    const sid = Number(b.closest('tr').dataset.id), n = spelare.find((s) => s.id === sid)?.namn;
    if (!window.confirm(`Ta bort ${n}? Spelaren är inaktiv och har inga kopplade n01-namn, så inga resultat försvinner.`)) return;
    kor(() => rpc('ta_bort_spelare', { sid }), `${n} är borttagen.`);
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
        <td>${l.tdid ? `<a href="#/tavling/${encodeURIComponent(l.tdid)}">en tävling</a>` : 'alla'}</td><td>${namn(l.fran_spelare)}</td><td>${namn(l.till_spelare)}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

// ---------- cuper ----------
const REGLER = [
  ['deltagande', 'Deltagande'], ['finalvinst', 'Finalvinst'], ['finalforlust', 'Finalförlust'], ['semifinal', 'Semifinalplats'],
  ['vunnen_match', 'Vunnen match'], ['hog_utgang', 'Hög utgång'], ['hog_utgang_fran', 'Hög utgång från (poäng)'],
  ['t180', '180-kast'], ['t171', '171-kast'], ['kortset', 'Kortset'], ['kortset_pilar', 'Kortset högst (pilar)'], ['bull', 'Bull-utgång'],
];
const STD = { deltagande: 5, finalvinst: 5, finalforlust: 3, semifinal: 2, vunnen_match: 1, hog_utgang: 1, hog_utgang_fran: 100, t180: 1, t171: 0, kortset: 0, kortset_pilar: 21, bull: 1 };

async function visaCupLista(app) {
  const cuper = await api('tavling?typ=eq.klubbcup&select=id,namn,serie,fran,till,aktiv,stangd&order=fran.desc.nullslast');
  app.innerHTML = `
    <h1>Cuper</h1>${meny('cuper')}
    <p class="muted">En cup samlar tävlingar med samma serie inom ett datumintervall – nya omgångar kommer med automatiskt. Under varje cup: poängregler, final, uteslutna omgångar och bull-utgångar.</p>
    <p><a class="btn" href="#/admin/cuper/ny">Ny cup</a></p>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Cup</th><th>Serie</th><th>Period</th><th>Aktiv</th><th>Stängd</th></tr></thead>
      <tbody>${cuper.map((c) => `<tr><td class="fast"><a href="#/admin/cuper/${c.id}">${esc(c.namn)}</a></td><td>${esc(c.serie ?? '')}</td>
        <td>${esc(c.fran ?? '…')} – ${esc(c.till ?? '…')}</td><td>${c.aktiv ? 'ja' : 'nej'}</td><td>${c.stangd ? 'ja' : 'nej'}</td></tr>`).join('')}</tbody></table></div>`;
}

async function visaCupAdmin(app, idText) {
  const ny = idText === 'ny';
  const id = ny ? null : Number(idText);
  const [cupRad, tavlingar, tt, valRader, spelare, manuell] = await Promise.all([
    ny ? [] : api(`tavling?id=eq.${id}&select=*`),
    api('turnering?select=tdid,titel,datum,serie,omgang&order=datum.desc'),
    ny ? [] : api(`v_tavling_turnering?tavling_id=eq.${id}&select=tdid,roll,datum`),
    ny ? [] : api(`tavling_val?tavling_id=eq.${id}&select=tdid,roll`),
    api('spelare?select=id,namn,visningsnamn&aktiv=eq.true'),
    ny ? [] : api(`poang_manuell?tavling_id=eq.${id}&select=*`),
  ]);
  const c = cupRad[0] ?? { namn: '', serie: '', fran: '', till: '', kvalgrans: 25, regler: STD, aktiv: true, stangd: false, kommentar: '' };
  if (!ny && !cupRad.length) { app.innerHTML = '<p class="fel">Cupen finns inte.</p>'; return; }
  spelare.sort(sortSp);
  const sp = Object.fromEntries(spelare.map((s) => [s.id, s]));
  const serier = [...new Set(tavlingar.map((t) => t.serie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv'));
  const r = { ...STD, ...(c.regler ?? {}) };
  const las = !!c.stangd;                      // stängd cup: det som avgör poängen är låst (migration 19)
  const dis = las ? ' disabled' : '';
  const iCup = new Map(tt.map((t) => [t.tdid, t.roll]));
  const valPa = new Map(valRader.map((v) => [v.tdid, v.roll]));
  // Tävlingar att visa: de som är med + uteslutna + övriga med samma serie
  const visas = tavlingar.filter((t) => iCup.has(t.tdid) || valPa.has(t.tdid) || (c.serie && t.serie === c.serie));
  const rollAv = (tdid) => valPa.get(tdid) === 'utesluten' ? 'utesluten' : iCup.get(tdid) ?? 'ingen';

  app.innerHTML = `
    <p><a href="#/admin/cuper" class="tillbaka">← Cuper</a>${ny ? '' : ` · <a href="#/cup/${id}">Visa poängtabellen</a>`}</p>
    <h1>${ny ? 'Ny cup' : esc(c.namn)}</h1>${meny('cuper')}
    <div class="kort">
      <h2>Cupen</h2>
      <div class="formrad"><label>Namn <input id="c-namn" value="${esc(c.namn)}" size="30"></label></div>
      <div class="formrad"><label>Serie <select id="c-serie"${dis}><option value="">–</option>${serier.map((s) => `<option${s === c.serie ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Från <input id="c-fran" value="${esc(c.fran ?? '')}" placeholder="ÅÅÅÅ-MM-DD" size="11"${dis}></label>
        <label>Till <input id="c-till" value="${esc(c.till ?? '')}" placeholder="ÅÅÅÅ-MM-DD" size="11"${dis}></label>
        <label>Kvalgräns <input id="c-kval" value="${c.kvalgrans ?? ''}" size="4" inputmode="numeric"${dis}></label>
        <label class="rad"><input type="checkbox" id="c-aktiv"${c.aktiv ? ' checked' : ''}> Aktiv</label>
        <label class="rad"><input type="checkbox" id="c-stangd"${las ? ' checked' : ''}> Stängd</label></div>
      <p class="muted liten">${las ? '<b>Cupen är stängd.</b> Serie, period, kvalgräns, poängregler, tävlingar och bull-utgångar är låsta. Avmarkera Stängd och tryck Spara för att öppna den igen. ' : 'Stäng cupen när den är avgjord: då låses det som avgör poängen. '}Spelare och namnkopplingar kan fortfarande ändras, och ställningen räknas om.</p>
      <h3>Poängregler</h3>
      <div class="regler">${REGLER.map(([k, n]) => `<label>${n} <input data-regel="${k}" value="${r[k] ?? 0}" size="4" inputmode="numeric"${dis}></label>`).join('')}</div>
      <p class="muted liten">0 = räknas inte. Kortset = vunnet leg på högst så många pilar. Hög utgång = utgång på minst så många poäng.</p>
      <div class="formrad"><label>Kommentar <input id="c-kommentar" value="${esc(c.kommentar ?? '')}" size="50"></label></div>
      <button class="btn" id="c-spara" type="button">${ny ? 'Skapa cupen' : 'Spara'}</button>
      <p class="svar" role="status"></p>
    </div>
    ${ny ? '' : `
    <h2>Tävlingar</h2>
    <p class="muted liten">Med automatiskt: serien <b>${esc(c.serie ?? '–')}</b> mellan ${esc(c.fran ?? '…')} och ${esc(c.till ?? '…')}. Ändra rollen för att markera finalspel, utesluta en omgång eller ta med en tävling som inte följer regeln.</p>
    <div class="formrad"><select id="lagg-till"${dis}>${tavlingar.filter((t) => !iCup.has(t.tdid)).map((t) => `<option value="${esc(t.tdid)}">${esc(t.datum ?? '')} ${esc(t.serie ?? t.titel)}${t.omgang ? ` ${t.omgang}` : ''}</option>`).join('')}</select>
      <select id="lagg-roll"${dis}><option value="final">som finalspel</option><option value="omgang">som omgång</option></select>
      <button class="btn liten" id="lagg" type="button"${dis}>Lägg till</button></div>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Datum</th><th>Tävling</th><th>Roll</th></tr></thead>
      <tbody>${visas.map((t) => `<tr data-tdid="${esc(t.tdid)}"><td class="fast">${esc(t.datum ?? '')}</td>
        <td><a href="#/tavling/${encodeURIComponent(t.tdid)}">${esc(t.serie ?? t.titel)}${t.omgang ? ` ${t.omgang}` : ''}</a></td>
        <td><select class="roll"${dis}>${[['omgang', 'Omgång'], ['final', 'Finalspel'], ['utesluten', 'Utesluten'], ['ingen', '– inte med –']].map(([v, n]) =>
          `<option value="${v}"${rollAv(t.tdid) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
    <h2>Bull-utgångar</h2>
    <p class="muted liten">Går inte att läsa ur n01 – fyll i antal per spelare.</p>
    <ul class="kandidater">${manuell.map((m) => `<li>${esc(m.spelare_id ? sp[m.spelare_id]?.namn ?? m.spelare_id : m.n01_namn)}: ${m.antal} ${m.kommentar ? `<small class="muted">${esc(m.kommentar)}</small>` : ''}
      <button class="btn liten sekundar ta-bort-bull" data-id="${m.id}" type="button"${dis}>Ta bort</button></li>`).join('') || '<li class="muted">Inga.</li>'}</ul>
    <div class="formrad"><select id="bull-spelare"${dis}>${val(spelare, null)}</select><input id="bull-antal" value="1" size="3" inputmode="numeric"${dis}>
      <button class="btn liten" id="bull-lagg" type="button"${dis}>Lägg till</button></div>`}`;

  const svar = app.querySelector('.svar');
  const om = (nyttId) => (nyttId ? (location.hash = `#/admin/cuper/${nyttId}`) : visaCupAdmin(app, idText));
  const kor = async (f, text = 'Sparat.') => { try { const nyttId = await f(); await om(nyttId); app.querySelector('.svar').textContent = text; } catch (e) { (app.querySelector('.svar') ?? svar).textContent = `Fel: ${e.message}`; } };
  const datum = (v) => { v = v.trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Datum skrivs ÅÅÅÅ-MM-DD'); return v || null; };
  app.querySelector('#c-spara').addEventListener('click', () => kor(async () => {
    const regler = {};
    app.querySelectorAll('[data-regel]').forEach((i) => { regler[i.dataset.regel] = Number(i.value.replace(',', '.')) || 0; });
    const rad = { namn: app.querySelector('#c-namn').value.trim(), serie: app.querySelector('#c-serie').value || null,
      fran: datum(app.querySelector('#c-fran').value), till: datum(app.querySelector('#c-till').value),
      kvalgrans: Number(app.querySelector('#c-kval').value) || null, aktiv: app.querySelector('#c-aktiv').checked, stangd: app.querySelector('#c-stangd').checked,
      kommentar: app.querySelector('#c-kommentar').value.trim() || null, regler };
    if (!rad.namn) throw new Error('Skriv ett namn');
    if (ny) { const [x] = await skriv('POST', 'tavling', rad); return x.id; }
    await skriv('PATCH', `tavling?id=eq.${id}`, rad);
    return null;
  }));
  if (ny) return;
  const sattRoll = async (tdid, roll) => {
    const har = valPa.get(tdid);
    const regelMatch = c.serie && tavlingar.some((t) => t.tdid === tdid && t.serie === c.serie && (!c.fran || t.datum >= c.fran) && (!c.till || t.datum <= c.till));
    const behovs = roll === 'ingen' ? (regelMatch ? 'utesluten' : null) : roll === 'omgang' && regelMatch ? null : roll;
    if (!behovs && har) await skriv('DELETE', `tavling_val?tavling_id=eq.${id}&tdid=eq.${encodeURIComponent(tdid)}`);
    else if (behovs && har) await skriv('PATCH', `tavling_val?tavling_id=eq.${id}&tdid=eq.${encodeURIComponent(tdid)}`, { roll: behovs });
    else if (behovs) await skriv('POST', 'tavling_val', { tavling_id: id, tdid, roll: behovs });
  };
  app.querySelectorAll('.roll').forEach((s) => s.addEventListener('change', () => kor(() => sattRoll(s.closest('tr').dataset.tdid, s.value))));
  app.querySelector('#lagg').addEventListener('click', () => kor(() => sattRoll(app.querySelector('#lagg-till').value, app.querySelector('#lagg-roll').value)));
  app.querySelector('#bull-lagg').addEventListener('click', () => kor(async () => {
    const spelare_id = Number(app.querySelector('#bull-spelare').value); if (!spelare_id) throw new Error('Välj en spelare');
    await skriv('POST', 'poang_manuell', { tavling_id: id, spelare_id, kategori: 'bull', antal: Number(app.querySelector('#bull-antal').value) || 1 });
  }));
  app.querySelectorAll('.ta-bort-bull').forEach((b) => b.addEventListener('click', () => kor(() => skriv('DELETE', `poang_manuell?id=eq.${b.dataset.id}`))));
}

// ---------- att göra / kvalitetssäkra ----------
const goraFilter = { ansvar: '', visaKlara: false };

async function visaAttGora(app) {
  const [uppg, delt, turn, iCup, cuper, spelare, alias, hamt] = await Promise.all([
    api('uppgift?select=*&order=ordning,id'),
    api('v_deltagare?select=namn,spelare_id'),
    api('turnering?select=tdid,datum,serie,omgang,titel&order=datum.desc'),
    api('v_tavling_turnering?select=tdid'),
    api('tavling?select=id,namn,kommentar'),
    api('spelare?select=id,namn,efternamn,medlemsnummer,aktiv'),
    api('alias?select=spelare_id'),
    api('hamtning?select=status,start,meddelande&order=id.desc&limit=1'),
  ]);
  const dsOkopplade = await api('v_ds_spelare?spelare_id=is.null&select=namn,lag').catch(() => []);
  // Automatiska kontroller – räknas varje gång sidan öppnas
  const okopplade = {};
  delt.filter((d) => !d.spelare_id).forEach((d) => { okopplade[d.namn] = (okopplade[d.namn] ?? 0) + 1; });
  const okNamn = Object.entries(okopplade).sort((a, b) => b[1] - a[1]);
  const medICup = new Set(iCup.map((t) => t.tdid));
  const utanCup = turn.filter((t) => !medICup.has(t.tdid));
  const kontrollera = cuper.filter((c) => /kontrollera/i.test(c.kommentar ?? ''));
  const aktiva = spelare.filter((x) => x.aktiv);
  const utanEfternamn = aktiva.filter((x) => !x.efternamn || x.efternamn.length <= 2);
  const utanNr = aktiva.filter((x) => !x.medlemsnummer);
  const harAlias = new Set(alias.map((a) => a.spelare_id));
  const tomma = spelare.filter((x) => !x.aktiv && !harAlias.has(x.id));
  const senaste = hamt[0];
  const kontroller = [
    [okNamn.length, 'administratör', `${okNamn.reduce((s, [, n]) => s + n, 0)} deltaganden med ${okNamn.length} namn är inte kopplade till en person`, okNamn.slice(0, 8).map(([n, a]) => `${n} (${a})`).join(', '), '#/admin/namn'],
    [utanCup.length, 'tävlingsledare', `${utanCup.length} tävlingar hör inte till någon cup`, utanCup.slice(0, 6).map((t) => `${t.datum} ${t.serie ?? t.titel}${t.omgang ? ` ${t.omgang}` : ''}`).join(', '), '#/admin/cuper'],
    [kontrollera.length, 'tävlingsledare', `${kontrollera.length} cuper har regler som ska kontrolleras`, kontrollera.map((c) => c.namn).join(', '), '#/admin/cuper'],
    [utanEfternamn.length, 'administratör', `${utanEfternamn.length} spelare saknar efternamn`, utanEfternamn.slice(0, 10).map((x) => x.namn).join(', '), '#/admin/spelare'],
    [utanNr.length, 'administratör', `${utanNr.length} spelare saknar medlemsnummer`, '', '#/admin/spelare'],
    [tomma.length, 'administratör', `${tomma.length} inaktiva spelare utan kopplingar kan tas bort`, tomma.map((x) => x.namn).join(', '), '#/admin/spelare'],
    [dsOkopplade.length, 'administratör', `${dsOkopplade.length} spelare i Bankeryds lag i distriktsserien är inte kopplade till en person`, dsOkopplade.map((x) => `${x.namn} (${x.lag})`).join(', '), '#/admin/serien'],
    [senaste?.status === 'fel' ? 1 : 0, 'administratör', 'Senaste hämtningen från n01 misslyckades', senaste?.meddelande ?? '', '#/admin'],
  ].filter(([n, ansvar]) => n > 0 && (!goraFilter.ansvar || goraFilter.ansvar === ansvar));

  const lista = uppg.filter((u) => (!goraFilter.ansvar || u.ansvar === goraFilter.ansvar) && (goraFilter.visaKlara || u.status === 'öppen'));
  const oppna = uppg.filter((u) => u.status === 'öppen');
  const knapp = (v, n) => `<button type="button" class="chip${goraFilter.ansvar === v ? ' vald' : ''}" data-ansvar="${v}">${n}</button>`;
  app.innerHTML = `
    <h1>Att göra</h1>${meny('gora')}
    <p class="muted">Kvalitetssäkring och uppgifter för tävlingsledaren och administratören. ${oppna.length} öppna uppgifter (tävlingsledare ${oppna.filter((u) => u.ansvar === 'tävlingsledare').length}, administratör ${oppna.filter((u) => u.ansvar === 'administratör').length}).</p>
    <div class="filter">${knapp('', 'Alla')}${knapp('tävlingsledare', 'Tävlingsledare')}${knapp('administratör', 'Administratör')}
      <label class="rad liten"><input type="checkbox" id="visa-klara"${goraFilter.visaKlara ? ' checked' : ''}> Visa klara</label></div>
    <h2>Automatiska kontroller</h2>
    <p class="muted liten">Räknas om varje gång sidan öppnas – försvinner när det är åtgärdat.</p>
    ${kontroller.length ? `<ul class="kontroller">${kontroller.map(([, ansvar, text, detalj, lank]) =>
      `<li><a href="${lank}"><b>${esc(text)}</b></a> <span class="etikett">${ansvar}</span>${detalj ? `<br><small class="muted">${esc(detalj)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Inget att åtgärda.</p>'}
    <h2>Uppgifter</h2>
    <p class="svar" role="status"></p>
    <div class="uppgifter">${lista.map((u) => `<div class="kort uppgift${u.status === 'klar' ? ' klar' : ''}" data-id="${u.id}">
      <label class="rad"><input type="checkbox" class="klar-ruta"${u.status === 'klar' ? ' checked' : ''}> <b>${esc(u.titel)}</b></label>
      <span class="etikett">${esc(u.ansvar)}</span>${u.kategori ? ` <span class="etikett">${esc(u.kategori)}</span>` : ''}
      ${u.beskrivning ? `<p class="liten">${esc(u.beskrivning)}</p>` : ''}
      ${u.lank ? `<p class="liten"><a href="${esc(u.lank)}">Gå dit →</a></p>` : ''}
      <div class="formrad"><input class="kommentar" value="${esc(u.kommentar ?? '')}" placeholder="Kommentar" size="40"><button class="btn liten sekundar spara-kommentar" type="button">Spara</button>
        ${u.klar_tid ? `<small class="muted">klar ${datumTid(u.klar_tid)}</small>` : ''}</div>
    </div>`).join('') || '<p class="muted">Inga uppgifter.</p>'}</div>
    <details class="kort"><summary>Ny uppgift</summary>
      <div class="formrad"><input id="ny-titel" placeholder="Vad ska göras?" size="40">
        <select id="ny-ansvar"><option>tävlingsledare</option><option>administratör</option></select></div>
      <div class="formrad"><input id="ny-beskrivning" placeholder="Beskrivning (valfritt)" size="50"></div>
      <button class="btn liten" id="ny-skapa" type="button">Lägg till</button></details>`;

  const kor = async (f, text = 'Sparat.') => { try { await f(); await visaAttGora(app); app.querySelector('.svar').textContent = text; } catch (e) { app.querySelector('.svar').textContent = `Fel: ${e.message}`; } };
  app.querySelectorAll('[data-ansvar]').forEach((b) => b.addEventListener('click', () => { goraFilter.ansvar = b.dataset.ansvar; visaAttGora(app); }));
  app.querySelector('#visa-klara').addEventListener('change', (e) => { goraFilter.visaKlara = e.target.checked; visaAttGora(app); });
  app.querySelectorAll('.klar-ruta').forEach((r) => r.addEventListener('change', () => {
    const id = r.closest('.uppgift').dataset.id;
    kor(() => skriv('PATCH', `uppgift?id=eq.${id}`, r.checked ? { status: 'klar', klar_tid: new Date().toISOString() } : { status: 'öppen', klar_tid: null }), r.checked ? 'Markerad som klar.' : 'Öppen igen.');
  }));
  app.querySelectorAll('.spara-kommentar').forEach((b) => b.addEventListener('click', () => {
    const k = b.closest('.uppgift');
    kor(() => skriv('PATCH', `uppgift?id=eq.${k.dataset.id}`, { kommentar: k.querySelector('.kommentar').value.trim() || null }));
  }));
  app.querySelector('#ny-skapa').addEventListener('click', () => kor(async () => {
    const titel = app.querySelector('#ny-titel').value.trim(); if (!titel) throw new Error('Skriv vad som ska göras');
    await skriv('POST', 'uppgift', { titel, ansvar: app.querySelector('#ny-ansvar').value, beskrivning: app.querySelector('#ny-beskrivning').value.trim() || null });
  }, 'Uppgiften är tillagd.'));
}

// ---------- distriktsserien: koppla lagmedlemmar till spelare ----------
async function visaSerieAdmin(app) {
  const [ligor, sp, alias, spelare] = await Promise.all([
    api('tavling?typ=eq.distriktsserie&select=id,namn,n01_lgid,aktiv'),
    api('v_ds_spelare?select=tdid,division,oid,lag,namn,spelare_id,kopplad_av_admin,matcher&order=lag,namn'),
    api('ds_alias?select=tdid,oid,spelare_id'),
    api('spelare?select=id,namn,visningsnamn&aktiv=eq.true'),
  ]);
  spelare.sort(sortSp);
  const sp_ = Object.fromEntries(spelare.map((s) => [s.id, s]));
  const harAlias = new Set(alias.map((a) => `${a.tdid}|${a.oid}`));
  app.innerHTML = `
    <h1>Distriktsserien</h1>${meny('serien')}
    <p class="muted">Ligor som följs: ${ligor.map((l) => `<b>${esc(l.namn)}</b> <span class="muted liten">(n01 ${esc(l.n01_lgid ?? '')}${l.aktiv ? '' : ', inaktiv'})</span>`).join(', ') || 'inga'}.
      Hela divisionernas tabeller hämtas, men matcher och spelarstatistik bara för Bankeryds lag.</p>
    <h2>Bankeryds lagmedlemmar</h2>
    <p class="muted liten">Namnen kopplas automatiskt om de stämmer med en spelares fullständiga namn eller ett allmänt n01-namn. Inom ett lag är namnen entydiga, så en koppling här gäller bara den här divisionen.</p>
    <p class="svar" role="status"></p>
    <div class="rulla"><table class="tabell">
      <thead><tr><th class="fast">Namn i n01</th><th>Lag</th><th>Matcher</th><th>Kopplad till</th><th></th></tr></thead>
      <tbody>${sp.map((r) => `<tr data-tdid="${esc(r.tdid)}" data-oid="${esc(r.oid)}">
        <td class="fast">${esc(r.namn)}</td><td>${esc(r.lag)} <span class="muted liten">${esc(r.division)}</span></td><td>${r.matcher}</td>
        <td><select class="ds-val">${val(spelare, r.spelare_id)}</select>
          <br><small class="muted">${r.spelare_id ? (r.kopplad_av_admin ? 'kopplad av admin' : `automatiskt: ${esc(spNamn(sp_[r.spelare_id]))}`) : 'inte kopplad'}</small></td>
        <td><button type="button" class="btn liten ds-spara">Spara</button>${harAlias.has(`${r.tdid}|${r.oid}`) ? ' <button type="button" class="btn liten sekundar ds-bort">Ta bort koppling</button>' : ''}</td></tr>`).join('')}</tbody>
    </table></div>`;
  const kor = async (f, text) => { try { await f(); await visaSerieAdmin(app); app.querySelector('.svar').textContent = text; } catch (e) { fel(app, e); } };
  app.querySelectorAll('.ds-spara').forEach((b) => b.addEventListener('click', () => {
    const tr = b.closest('tr'); const { tdid, oid } = tr.dataset;
    const spelare_id = Number(tr.querySelector('.ds-val').value);
    if (!spelare_id) { app.querySelector('.svar').textContent = 'Välj en spelare.'; return; }
    kor(async () => {
      const q = `ds_alias?tdid=eq.${encodeURIComponent(tdid)}&oid=eq.${encodeURIComponent(oid)}`;
      if (harAlias.has(`${tdid}|${oid}`)) await skriv('PATCH', q, { spelare_id });
      else await skriv('POST', 'ds_alias', { tdid, oid, spelare_id });
    }, 'Sparat.');
  }));
  app.querySelectorAll('.ds-bort').forEach((b) => b.addEventListener('click', () => {
    const { tdid, oid } = b.closest('tr').dataset;
    kor(() => skriv('DELETE', `ds_alias?tdid=eq.${encodeURIComponent(tdid)}&oid=eq.${encodeURIComponent(oid)}`), 'Kopplingen är borttagen.');
  }));
}
