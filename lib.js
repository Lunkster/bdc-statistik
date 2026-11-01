// Gemensamt: Supabase-anrop, inloggning (medlem/admin), formatering enligt SI.

export const SUPABASE_URL = 'https://xkfjbrkrtetkbjugresq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_H5FSgAJa63PrDJ6Y6EMpZg_YlDjm5Mq'; // publik nyckel, skyddet är RLS
// Två delade konton – koden är lösenordet. Rollen står i kontots app_metadata.roll.
const KONTO = { medlem: 'lundqvist.henrik+bdc@proton.me', admin: 'lundqvist.henrik+bdcadmin@proton.me' };
const SESSION_KEY = 'bdc-session';   // samma webbadress (lunkster.github.io) som andra appar – egen nyckel

// ---------- läsa ----------
export async function api(path) {
  const s = await session(true);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, Accept: 'application/json' },
  });
  if (!r.ok) throw await fel(r);
  return r.json();
}

// ---------- skriva (admin; behörigheten avgörs av RLS i databasen) ----------
export async function skriv(method, path, body) {
  const s = await session(true);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw await fel(r);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
export const rpc = (namn, args) => skriv('POST', `rpc/${namn}`, args ?? {});

// ---------- Edge Function ----------
export async function funktion(namn, body) {
  const s = await session(true);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${namn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.fel || `Fel ${r.status}`), { status: r.status });
  return j;
}

async function fel(r) {
  const t = await r.text();
  let msg = t;
  try { msg = JSON.parse(t).message || t; } catch { /* text */ }
  if (r.status === 401) logout();
  return Object.assign(new Error(msg), { status: r.status });
}

// ---------- inloggning ----------
function load() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function save(s) { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* privat läge */ } }
let current = load();

async function auth(grant, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at };
}

export async function login(kod, admin = false) {
  current = await auth('password', { email: admin ? KONTO.admin : KONTO.medlem, password: kod });
  save(current);
  return !!current;
}
export function logout() { current = null; save(null); }
export const isLoggedIn = () => !!current;

// Rollen ur JWT:n (bara för att visa/dölja – behörigheten avgörs i databasen)
export function roll() {
  try {
    const p = JSON.parse(atob(current.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.app_metadata?.roll ?? '';
  } catch { return ''; }
}
export const arAdmin = () => roll() === 'admin';

async function session(required) {
  if (!current) { if (required) throw Object.assign(new Error('Inte inloggad'), { status: 401 }); return null; }
  if (current.expires_at * 1000 < Date.now() + 60_000) {
    const s = await auth('refresh_token', { refresh_token: current.refresh_token });
    if (!s) { logout(); if (required) throw Object.assign(new Error('Inloggningen har gått ut'), { status: 401 }); return null; }
    current = s; save(s);
  }
  return current;
}

// ---------- format (SI, oberoende av webbläsarens språk) ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (v, d = 1) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? '–'
  : Number(v).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const heltal = (v) => (v === null || v === undefined) ? '–' : Number(v).toLocaleString('sv-SE');
const tva = (n) => String(n).padStart(2, '0');
// ÅÅÅÅ-MM-DD TT:MM i svensk tid
export function datumTid(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export const procent = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '–');
export { tva };

// ---------- porträtt (privat bucket "portratt", signerade länkar som gäller en timme) ----------
let bilder = new Map();
let bilderTid = 0;
export async function laddaBilder(tvinga = false) {
  if (!tvinga && Date.now() - bilderTid < 50 * 60_000) return;
  const rader = await api('spelare?bild=not.is.null&select=id,bild');
  const ny = new Map();
  if (rader.length) {
    const s = await session(true);
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/portratt`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600, paths: rader.map((x) => x.bild.split('?')[0]) }),
    });
    if (r.ok) (await r.json()).forEach((x, i) => {
      if (x.signedURL) ny.set(rader[i].id, `${SUPABASE_URL}/storage/v1${x.signedURL}&${rader[i].bild.split('?')[1] ?? ''}`);
    });
  }
  bilder = ny; bilderTid = Date.now();
}
export const bildUrl = (id) => bilder.get(Number(id)) ?? null;
export const avatar = (id, klass = 'avatar') => { const u = bildUrl(id); return u ? `<img class="${klass}" src="${esc(u)}" alt="" loading="lazy">` : ''; };

// Bilden beskärs till en kvadrat och förminskas till 256×256 JPEG i webbläsaren före uppladdning
async function kvadrat(fil, px = 256) {
  const bmp = await createImageBitmap(fil);
  const sida = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = px; c.height = px;
  c.getContext('2d').drawImage(bmp, (bmp.width - sida) / 2, (bmp.height - sida) / 2, sida, sida, 0, 0, px, px);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}
export async function laddaUppBild(id, fil) {
  const blob = await kvadrat(fil);
  const s = await session(true);
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/portratt/${id}.jpg`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: blob,
  });
  if (!r.ok) throw await fel(r);
  await rpc('satt_bild', { sid: id, bild: `${id}.jpg?v=${Date.now()}` });
  await laddaBilder(true);
}
export async function taBortBild(id) {
  const s = await session(true);
  await fetch(`${SUPABASE_URL}/storage/v1/object/portratt/${id}.jpg`, {
    method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` },
  });
  await rpc('satt_bild', { sid: id, bild: null });
  await laddaBilder(true);
}

// Länk till en spelare: kopplad person (med porträtt om det finns) eller okopplat n01-namn
export function spelarlank(namn, spelareId) {
  if (spelareId) return `<a href="#/spelare/${spelareId}">${avatar(spelareId)}${esc(namn)}</a>`;
  return `<a href="#/namn/${encodeURIComponent(namn)}" class="okopplad" title="Inte kopplad till en person än">${esc(namn)}</a>`;
}
