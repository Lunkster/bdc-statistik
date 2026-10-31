// Edge Function "hamta": hämtar Bankeryds turneringar från n01darts.com till databasen.
//
// Anropas av
//  - schemat (pg_cron, tor och sön 23:00 svensk tid) med headern x-hamta-nyckel (hemlighet i Vault),
//  - knappen "Hämta nu" i appen med inloggad admins JWT.
// Body (valfri): {"kalla": "schema" | "knapp" | "manuell", "tdid": "..."}  (tdid = bara den turneringen)
//
// Arbetar i omgångar: slutar efter ca 110 s och fortsätter där den slutade nästa gång
// (en turnering räknas som klar först när alla matcher är hämtade).
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.n01darts.com/api/v1/";
const TIDSGRANS_MS = 110_000;
const PARALLELLT = 6;
const STATISTIK = ["stats_list", "player_high_out", "player_best_leg"];

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hamta-nyckel",
};
const svar = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function n01(vag: string, forsok = 3): Promise<any> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(API + vag);
      const j = await r.json();
      if (j.result !== 0) throw new Error(`n01 ${vag}: result ${j.result} ${j.error ?? ""}`);
      return j;
    } catch (e) {
      if (i >= forsok) throw e;
      await new Promise((ok) => setTimeout(ok, 500 * i));
    }
  }
}

async function lista(vag: string): Promise<any[]> {
  const ut: any[] = [];
  for (let skip = 0; ; skip += 100) {
    const j = await n01(`${vag}${vag.includes("?") ? "&" : "?"}count=100&skip=${skip}`);
    ut.push(...(j.list ?? []));
    if (!j.list || j.list.length < 100) return ut;
  }
}

async function ok(fel: { error: any }, var_: string) {
  if (fel.error) throw new Error(`${var_}: ${fel.error.message}`);
}

// Datum i svensk tid ur UNIX-sekunder
function svensktDatum(sek: number): string | null {
  if (!sek) return null;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(sek * 1000));
}

// "Bankeryd Dart Club Torsdagscup omg 6 29/10" -> serie "Torsdagscup", omgång 6
export function tolkaTitel(titel: string): { serie: string | null; omgang: number | null } {
  let t = titel.replace(/bankeryd\s*dart\s*club\s*:?/i, "").replace(/bankeryd/i, "");
  let omgang: number | null = null;
  const m = t.match(/\b(?:omg|v)\.?\s*(\d{1,2})\b/i);
  if (m) { omgang = Number(m[1]); t = t.replace(m[0], ""); }
  t = t.replace(/\b\d{1,2}\/\d{1,2}\b/g, "").replace(/[-–:]\s*\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  const serie = t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
  return { serie, omgang };
}

function startpoang(t: any): number | null {
  for (const k of ["rr_setting", "t_setting", "s2_setting", "lg_setting", "d_setting", "m_setting"]) {
    const s = t[k];
    if (s && (s.round_robin || s.tournament || s.league || s.matchs) && s.startScore) return Number(s.startScore);
  }
  return null;
}

async function sparaMatch(m: any) {
  const tid = (s: number) => (s ? new Date(s * 1000).toISOString() : null);
  await ok(await db.from("match").upsert({
    mid: m.mid, tdid: m.tdid, tmid: m.tmid ?? null, scid: m.scid || null, ttype: m.ttype ?? null,
    rond: m.round ?? null, t_no: m.t_no ?? null, match_type: m.match_type || "01",
    startpoang: m.startScore ?? null, legs_for_vinst: m.limitLeg ?? null, starttid: tid(m.startTime),
    klar: m.endMatch === 1, n01_uppdaterad: m.updateTime ?? null, data: m,
  }), "match");
  const sd = m.statsData ?? [];
  await ok(await db.from("match_spelare").upsert(sd.slice(0, 2).map((s: any, sida: number) => ({
    mid: m.mid, sida, tdid: m.tdid, tpid: s.tpid || null, namn: (s.name ?? "").trim() || "?",
    legs: s.winLegs ?? 0, poang: s.allScore ?? 0, pilar: s.allDarts ?? 0,
  }))), "match_spelare");
  // Legs och kast skrivs om helt (rättningar i n01 följer med)
  await ok(await db.from("leg").delete().eq("mid", m.mid), "leg delete");
  const legs = (m.legData ?? []).map((l: any, nr: number) => ({
    mid: m.mid, nr, forst: l.first ?? null, vinnare: l.endFlag ? (l.winner ?? null) : null,
    mfd: l.middleForDiddle === 1, starttid: l.time ? new Date(l.time).toISOString() : null,
  }));
  if (legs.length) await ok(await db.from("leg").insert(legs), "leg");
  if ((m.match_type || "01") !== "01") return;
  const kast: any[] = [];
  (m.legData ?? []).forEach((l: any, nr: number) => {
    (l.playerData ?? []).slice(0, 2).forEach((rader: any[], sida: number) => {
      let foreg = m.startScore ?? null;
      (rader ?? []).forEach((r: any, i: number) => {
        if (i === 0) { foreg = r.left; return; }               // startraden
        const utgang = r.score < 0;
        kast.push({
          mid: m.mid, leg_nr: nr, sida, runda: i,
          poang: utgang ? foreg : r.score, kvar: r.left, pilar: utgang ? -r.score : 3, utgang,
        });
        foreg = r.left;
      });
    });
  });
  for (let i = 0; i < kast.length; i += 1000) await ok(await db.from("kast").insert(kast.slice(i, i + 1000)), "kast");
}

async function hamtaTurnering(tdid: string, slut: number, rakna: { matcher: number }) {
  const t = (await n01(`tournament/get?tdid=${tdid}`)).tournament;
  const { entry_list, ...doc } = t;
  const { serie, omgang } = tolkaTitel(t.title);
  await ok(await db.from("turnering").upsert({
    tdid, titel: t.title, datum: svensktDatum(t.t_date), starttid: t.t_date ? new Date(t.t_date * 1000).toISOString() : null,
    serie, omgang, status: t.status, startpoang: startpoang(t), hamtad: new Date().toISOString(), data: doc,
    // n01_uppdaterad sätts först när allt är hämtat
  }), "turnering");
  await ok(await db.from("deltagare").delete().eq("tdid", tdid), "deltagare delete");
  if (entry_list?.length) {
    await ok(await db.from("deltagare").insert(entry_list.map((e: any) => ({
      tdid, tpid: e.tpid, namn: (e.name ?? "").trim() || "?", ordning: e.index ?? null,
    }))), "deltagare");
  }
  for (const kind of STATISTIK) {
    const s = await n01(`tournament/stats?tdid=${tdid}&kind=${kind}`);
    await ok(await db.from("turnering_statistik").upsert({ tdid, typ: kind, data: s.stats ?? null }), "statistik");
  }
  // Matcher: hämta bara nya eller ändrade
  const matcher = await lista(`match/list?tdid=${tdid}&fields=mid,updateTime`);
  const { data: finns } = await db.from("match").select("mid, n01_uppdaterad").eq("tdid", tdid);
  const kand = new Map((finns ?? []).map((r: any) => [r.mid, Number(r.n01_uppdaterad)]));
  const att = matcher.filter((m) => kand.get(m.mid) !== Number(m.updateTime));
  for (let i = 0; i < att.length; i += PARALLELLT) {
    if (Date.now() > slut) return false;
    await Promise.all(att.slice(i, i + PARALLELLT).map(async (x) => {
      const m = (await n01(`match/get?mid=${encodeURIComponent(x.mid)}`)).match;
      await sparaMatch(m);
      rakna.matcher++;
    }));
  }
  await ok(await db.from("turnering").update({ n01_uppdaterad: t.updateTime }).eq("tdid", tdid), "turnering klar");
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return svar("ok");
  const start = Date.now();
  const body = await req.json().catch(() => ({}));

  // Behörighet: schemats nyckel eller inloggad admin
  const nyckel = req.headers.get("x-hamta-nyckel");
  let kalla = "knapp";
  if (nyckel) {
    const { data } = await db.rpc("hamtnyckel_ok", { nyckel });
    if (data !== true) return svar({ fel: "fel nyckel" }, 401);
    kalla = body.kalla === "manuell" ? "manuell" : "schema";
  } else {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await db.auth.getUser(jwt);
    if (data?.user?.app_metadata?.roll !== "admin") return svar({ fel: "bara admin får starta hämtning" }, 403);
  }

  // Spärr: kör inte om en hämtning startade för mindre än 3 minuter sedan och inte är klar
  const { data: pagar } = await db.from("hamtning").select("id").eq("status", "pågår")
    .gte("start", new Date(Date.now() - 180_000).toISOString()).limit(1);
  if (pagar?.length) return svar({ ok: false, fel: "en hämtning pågår redan – vänta ett par minuter" }, 409);

  const { data: logg } = await db.from("hamtning").insert({ kalla }).select("id").single();
  const rakna = { turneringar: 0, matcher: 0 };
  let klart = true;
  try {
    let lista_ = (await lista("tournament/list?keyword=Bankeryd&fields=tdid,title,status,updateTime&sort=t_date&order=asc"))
      .filter((t) => /bankeryd/i.test(t.title) && t.status === 40);
    if (body.tdid) lista_ = lista_.filter((t) => t.tdid === body.tdid);
    const { data: finns } = await db.from("turnering").select("tdid, n01_uppdaterad");
    const kand = new Map((finns ?? []).map((r: any) => [r.tdid, Number(r.n01_uppdaterad)]));
    const att = lista_.filter((t) => kand.get(t.tdid) !== Number(t.updateTime));
    for (const t of att) {
      if (Date.now() - start > TIDSGRANS_MS) { klart = false; break; }
      const hel = await hamtaTurnering(t.tdid, start + TIDSGRANS_MS, rakna);
      if (!hel) { klart = false; break; }
      rakna.turneringar++;
    }
    const kvar = att.length - rakna.turneringar;
    const meddelande = klart ? "allt hämtat" : `tidsgräns – ${kvar} turneringar kvar, kör igen`;
    await db.from("hamtning").update({
      slut: new Date().toISOString(), status: "klar", nya_turneringar: rakna.turneringar,
      nya_matcher: rakna.matcher, meddelande,
    }).eq("id", logg!.id);
    return svar({ ok: true, klart, kvar, ...rakna });
  } catch (e) {
    await db.from("hamtning").update({
      slut: new Date().toISOString(), status: "fel", nya_turneringar: rakna.turneringar,
      nya_matcher: rakna.matcher, meddelande: String(e).slice(0, 2000),
    }).eq("id", logg!.id);
    return svar({ ok: false, fel: String(e), ...rakna }, 500);
  }
});
