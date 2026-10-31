// Edge Function "hamta": hämtar Bankeryds turneringar och distriktsserien från n01darts.com till databasen.
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

// ---------- Distriktsserien (v0.5) ----------
// Ligor att följa = tavling med typ 'distriktsserie' och n01_lgid. Varje division är en n01-turnering
// med lag som deltagare. Hela serietabellen och alla lagmatchresultat sparas; delmatcher (singlar,
// dubblar) med legs och rundor, och spelarstatistiken, bara för Bankeryds lag.
const arBankeryd = (namn: string) => /bankeryd/i.test(namn ?? "");

// "t_gpeF_0443_lg_0_xpj5_DUR6_dyah" -> { nyckel: "0_xpj5", a: "DUR6", b: "dyah" }
function tolkaTmid(tdid: string, tmid: string) {
  const del = (tmid ?? "").replace(`${tdid}_lg_`, "").split("_");
  if (del.length < 4) return null;
  return { nyckel: `${del[0]}_${del[1]}`, a: del[2], b: del[3] };
}

async function sparaDsMatch(m: any, tdid: string, nyckel: string, schema: Map<string, any>) {
  const tid = (s: number) => (s ? new Date(s * 1000).toISOString() : null);
  const sch = schema.get(m.schid);
  const sd = (m.statsData ?? []).slice(0, 2);
  const delmatch = sch?.subTitle ?? String(m.title ?? "").replace(/^.*?(Singel|Dubbel)/i, "$1");
  const dubbel = sch ? Number(sch.num_part) === 2 : sd.some((s: any) => (s.order ?? []).length > 1) || /dubbel/i.test(delmatch);
  await ok(await db.from("ds_match").upsert({
    mid: m.mid, tdid, nyckel, schid: m.schid ?? null, nr: sch?.index ?? null, delmatch, dubbel,
    legs_for_vinst: m.limitLeg ?? null, starttid: tid(m.startTime), klar: m.endMatch === 1,
    n01_uppdaterad: m.updateTime ?? null, data: m,
  }), "ds_match");
  await ok(await db.from("ds_match_sida").delete().eq("mid", m.mid), "ds_match_sida delete");
  await ok(await db.from("ds_match_sida").insert(sd.map((s: any, sida: number) => ({
    mid: m.mid, sida, lag_tpid: s.tpid || "?", legs: s.winLegs ?? 0, poang: s.allScore ?? 0, pilar: s.allDarts ?? 0,
  }))), "ds_match_sida");
  const spelare = sd.flatMap((s: any, sida: number) => (s.order ?? []).map((o: any, plats: number) => ({
    mid: m.mid, sida, plats, oid: o.oid || null, namn: (o.oname ?? "").trim() || "?",
  })));
  if (spelare.length) await ok(await db.from("ds_match_spelare").insert(spelare), "ds_match_spelare");
  await ok(await db.from("ds_leg").delete().eq("mid", m.mid), "ds_leg delete");
  const legs = (m.legData ?? []).map((l: any, nr: number) => ({
    mid: m.mid, nr, forst: l.first ?? null, vinnare: l.endFlag ? (l.winner ?? null) : null, mfd: l.middleForDiddle === 1,
  }));
  if (legs.length) await ok(await db.from("ds_leg").insert(legs), "ds_leg");
  if ((m.match_type || "01") !== "01") return;
  const kast: any[] = [];
  (m.legData ?? []).forEach((l: any, nr: number) => {
    (l.playerData ?? []).slice(0, 2).forEach((rader: any[], sida: number) => {
      let foreg = m.startScore ?? null;
      (rader ?? []).forEach((r: any, i: number) => {
        if (i === 0) { foreg = r.left; return; }
        const utgang = r.score < 0;
        kast.push({ mid: m.mid, leg_nr: nr, sida, runda: i, poang: utgang ? foreg : r.score, kvar: r.left, pilar: utgang ? -r.score : 3, utgang });
        foreg = r.left;
      });
    });
  });
  for (let i = 0; i < kast.length; i += 1000) await ok(await db.from("ds_kast").insert(kast.slice(i, i + 1000)), "ds_kast");
}

async function hamtaDivision(tavling_id: number, tdid: string, slut: number, rakna: { ds_matcher: number }) {
  const t = (await n01(`tournament/get?tdid=${tdid}`)).tournament;
  const { entry_list, ...doc } = t;
  const lag = (entry_list ?? []).map((e: any) => ({
    tdid, tpid: e.tpid, namn: (e.name ?? "").trim() || "?", ordning: e.index ?? null, bankeryd: arBankeryd(e.name),
  }));
  const bk = new Set(lag.filter((l: any) => l.bankeryd).map((l: any) => l.tpid));
  const tabell = (await n01(`tournament/standings?tdid=${tdid}`)).groups ?? null;
  let spelarstatistik: Record<string, any> | null = null;
  if (bk.size) {
    const s = (await n01(`tournament/stats?tdid=${tdid}&kind=player_stats_list`)).stats ?? {};
    spelarstatistik = Object.fromEntries(Object.entries(s).filter(([, v]: any) => bk.has(v.tpid)));
  }
  const division = String(t.lg_title?.[0] ?? t.title).match(/div\.?\s*\w+/i)?.[0] ?? t.title;
  await ok(await db.from("ds_division").upsert({
    tdid, tavling_id, titel: t.title, division, status: t.status, startpoang: Number(t.lg_setting?.startScore) || null,
    hamtad: new Date().toISOString(), data: doc, tabell, spelarstatistik,
  }), "ds_division");
  await ok(await db.from("ds_lag").delete().eq("tdid", tdid), "ds_lag delete");
  if (lag.length) await ok(await db.from("ds_lag").insert(lag), "ds_lag");

  // Lagmatcher: resultat ur lg_result, lag och datum ur matchlistan
  const matcher = await lista(`match/list?tdid=${tdid}&fields=mid,tmid,startTime,updateTime`);
  const lm = new Map<string, any>();
  for (const x of matcher) {
    const p = tolkaTmid(tdid, x.tmid); if (!p) continue;
    const r = lm.get(p.nyckel) ?? { ...p, start: x.startTime || Infinity };
    r.start = Math.min(r.start, x.startTime || Infinity);
    lm.set(p.nyckel, r);
  }
  const res = t.lg_result ?? {};
  for (const [nyckel, sidor] of Object.entries(res) as [string, any][]) {
    if (lm.has(nyckel)) continue;
    const [a, b] = Object.keys(sidor ?? {});
    if (a && b) lm.set(nyckel, { nyckel, a, b, start: Infinity });
  }
  const lagmatcher = [...lm.values()].map((x) => {
    const r = res[x.nyckel] ?? {};
    return {
      tdid, nyckel: x.nyckel, lag_a: x.a, lag_b: x.b,
      vunna_a: r[x.a]?.[x.b]?.r ?? null, vunna_b: r[x.b]?.[x.a]?.r ?? null,
      snitt_a: r[x.a]?.[x.b]?.a ?? null, snitt_b: r[x.b]?.[x.a]?.a ?? null,
      datum: Number.isFinite(x.start) ? svensktDatum(x.start) : null,
    };
  });
  await ok(await db.from("ds_lagmatch").delete().eq("tdid", tdid), "ds_lagmatch delete");
  if (lagmatcher.length) await ok(await db.from("ds_lagmatch").insert(lagmatcher), "ds_lagmatch");

  // Bankeryds delmatcher: bara nya eller ändrade
  const schema = new Map<string, any>((t.lg_setting?.schedule ?? []).map((s: any, index: number) => [s.schid, { ...s, index }]));
  const { data: finns } = await db.from("ds_match").select("mid, n01_uppdaterad").eq("tdid", tdid);
  const kand = new Map((finns ?? []).map((r: any) => [r.mid, Number(r.n01_uppdaterad)]));
  const att = matcher.filter((x) => {
    const p = tolkaTmid(tdid, x.tmid);
    return p && (bk.has(p.a) || bk.has(p.b)) && kand.get(x.mid) !== Number(x.updateTime);
  });
  for (let i = 0; i < att.length; i += PARALLELLT) {
    if (Date.now() > slut) return false;
    await Promise.all(att.slice(i, i + PARALLELLT).map(async (x) => {
      const m = (await n01(`match/get?mid=${encodeURIComponent(x.mid)}`)).match;
      await sparaDsMatch(m, tdid, tolkaTmid(tdid, x.tmid)!.nyckel, schema);
      rakna.ds_matcher++;
    }));
  }
  await ok(await db.from("ds_division").update({ n01_uppdaterad: t.updateTime }).eq("tdid", tdid), "ds_division klar");
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
  const rakna = { turneringar: 0, matcher: 0, divisioner: 0, ds_matcher: 0 };
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
    // Förberäknad statistik per match räknas om när något nytt har kommit
    if (rakna.matcher > 0) await ok(await db.rpc("uppdatera_statistik"), "uppdatera_statistik");
    let kvar = att.length - rakna.turneringar;

    // Distriktsserien: ligor som följs, divisioner som ändrats i n01 (även pågående)
    let dsKvar = 0;
    if (klart) {
      const { data: ligor } = await db.from("tavling").select("id, n01_lgid")
        .eq("typ", "distriktsserie").eq("aktiv", true).not("n01_lgid", "is", null);
      const { data: dsFinns } = await db.from("ds_division").select("tdid, n01_uppdaterad");
      const dsKand = new Map((dsFinns ?? []).map((r: any) => [r.tdid, Number(r.n01_uppdaterad)]));
      for (const liga of ligor ?? []) {
        let div = await lista(`tournament/list?lgid=${encodeURIComponent(liga.n01_lgid)}&fields=tdid,title,status,updateTime`);
        if (body.tdid) div = div.filter((d) => d.tdid === body.tdid);
        const andrade = div.filter((d) => dsKand.get(d.tdid) !== Number(d.updateTime));
        for (const d of andrade) {
          if (!klart || Date.now() - start > TIDSGRANS_MS) { klart = false; dsKvar++; continue; }
          const hel = await hamtaDivision(liga.id, d.tdid, start + TIDSGRANS_MS, rakna);
          if (!hel) { klart = false; dsKvar++; continue; }
          rakna.divisioner++;
        }
      }
    }
    const meddelande = klart ? "allt hämtat"
      : `tidsgräns – ${kvar ? `${kvar} turneringar` : ""}${kvar && dsKvar ? " och " : ""}${dsKvar ? `${dsKvar} divisioner` : ""} kvar, kör igen`;
    kvar += dsKvar;
    const dsText = rakna.divisioner || rakna.ds_matcher ? ` · distriktsserien: ${rakna.divisioner} divisioner, ${rakna.ds_matcher} matcher` : "";
    await db.from("hamtning").update({
      slut: new Date().toISOString(), status: "klar", nya_turneringar: rakna.turneringar,
      nya_matcher: rakna.matcher, meddelande: meddelande + dsText,
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
