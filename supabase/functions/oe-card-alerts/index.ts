/**
 * oe-card-alerts — the two ways a card reaches a member's inbox.
 *
 *  instant: a card in the top fit band ('strong') is emailed at once, at most
 *           two a member in any rolling 24 hours, only when the member has the
 *           instant switch on. Anything over the limit waits for the summary.
 *  digest:  every other new card goes in one daily summary at the member's
 *           chosen local hour (7, 8 or 9), only when the summary switch is on.
 *  hourly:  what the cron calls — instant for anyone with a strong card
 *           waiting, then the summary for members whose hour it is.
 *
 * Body { mode, user_id?, dry?: true } — dry renders and returns the email
 * without sending or marking anything.
 * Every word comes from oe_vocabulary, in the member's language.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withRun } from "../_shared/oeRun.ts";
import { renderCardAlert, type AlertCard } from "../_shared/cardAlertEmail.ts";
import { resolveEmailLang } from "../_shared/emailLang.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM = "KnownBy <invites@aura-intel.org>";
const SITE = (Deno.env.get("SITE_URL") || "https://aura-intel.org").replace(/\/$/, "");
const INSTANT_MAX_24H = 2;
const DEFAULT_TZ = "UTC";

type Lang = "en" | "ar";
type Card = AlertCard;

async function loadVocab(admin: SupabaseClient) {
  const { data } = await admin.from("oe_vocabulary").select("key,en,ar").like("key", "email_%");
  const map = new Map((data ?? []).map((r: any) => [r.key, r]));
  return (key: string, lang: Lang) => String((map.get(key) as any)?.[lang] || (map.get(key) as any)?.en || key);
}

const render = (kind: "instant" | "digest", cards: Card[], lang: Lang, v: (k: string, l: Lang) => string) =>
  renderCardAlert(kind, cards, lang, v, SITE);

Deno.serve(withRun("card_alerts", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON && req.headers.get("x-cron-secret") === CRON) || bearer === SR)) return json({ error: "Forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const mode = String(body.mode ?? "hourly");
  const dry = body.dry === true;
  const onlyUser = body.user_id ? String(body.user_id) : null;
  // Look-back for waiting cards; a dry run may widen it to render real rows.
  const days = Math.max(1, Math.min(Number(body.days ?? 7) || 7, dry ? 60 : 7));
  if (!["instant", "digest", "hourly"].includes(mode)) return json({ ok: false, error: "mode must be instant, digest or hourly" }, 400);

  const admin = createClient(URL_, SR, { auth: { persistSession: false } });
  const v = await loadVocab(admin);
  const RESEND = Deno.env.get("RESEND_API_KEY") || "";
  const counts = { instant_sent: 0, digest_sent: 0, skipped: 0, errors: 0 } as Record<string, number>;
  const errors: string[] = [];
  const previews: any[] = [];

  async function pending(uid: string, strongOnly: boolean): Promise<Card[]> {
    let q = admin.from("oe_cards")
      .select("id,opportunity_id,fit_band,created_at,opp:oe_opportunities!inner(title,issuer_raw,location,deadline,alive)")
      .eq("user_id", uid).eq("lane", "act").not("opportunity_id", "is", null).is("alerted_at", null)
      .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
      .order("created_at", { ascending: true }).limit(40);
    if (strongOnly) q = q.eq("fit_band", "strong");
    const { data, error } = await q;
    if (error) throw new Error(`pending cards: ${error.message}`);
    const rows = ((data ?? []) as any[]).filter((c) => c.opp?.alive);
    if (!rows.length) return [];
    // A card he has already acted on is not news.
    const { data: tapped } = await admin.from("oe_serves").select("opportunity_id")
      .eq("user_id", uid).not("tap", "is", null).in("opportunity_id", rows.map((r) => r.opportunity_id));
    const done = new Set((tapped ?? []).map((t: any) => String(t.opportunity_id)));
    return rows.filter((r) => !done.has(String(r.opportunity_id)));
  }

  async function member(uid: string) {
    const [{ data: el }, lang, { data: prof }] = await Promise.all([
      admin.from("oe_eligibility").select("alert_instant,digest_on,digest_hour").eq("user_id", uid).maybeSingle(),
      // The reader's language: the member's saved interface language, else English.
      resolveEmailLang(undefined, admin, uid),
      admin.from("diagnostic_profiles").select("timezone").eq("user_id", uid).maybeSingle(),
    ]);
    const { data: u } = await admin.auth.admin.getUserById(uid);
    return {
      instant: (el as any)?.alert_instant !== false,
      digest: (el as any)?.digest_on !== false,
      hour: Number((el as any)?.digest_hour ?? 8),
      lang: lang as Lang,
      tz: String((prof as any)?.timezone || DEFAULT_TZ),
      email: u?.user?.email ?? null,
    };
  }

  async function send(to: string, mail: { subject: string; html: string; text: string }) {
    if (!RESEND) throw new Error("RESEND_API_KEY missing");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }

  async function mark(ids: string[], kind: string) {
    const now = new Date().toISOString();
    await admin.from("oe_cards").update({ alerted_at: now, alert_kind: kind, sent_at: now }).in("id", ids);
  }

  async function runInstant(uid: string) {
    const m = await member(uid);
    if (!m.instant || !m.email) { counts.skipped++; return; }
    const { count: sent24 } = await admin.from("oe_cards").select("id", { count: "exact", head: true })
      .eq("user_id", uid).eq("alert_kind", "instant").gte("alerted_at", new Date(Date.now() - 86_400_000).toISOString());
    let room = Math.max(0, INSTANT_MAX_24H - (sent24 ?? 0));
    if (!room) { counts.skipped++; return; }
    for (const c of await pending(uid, true)) {
      if (!room) break;
      const mail = render("instant", [c], m.lang, v);
      if (dry) { previews.push({ user_id: uid, kind: "instant", ...mail }); room--; continue; }
      try { await send(m.email, mail); await mark([c.id], "instant"); counts.instant_sent++; room--; }
      catch (e) { counts.errors++; errors.push(String((e as Error).message)); break; }
    }
  }

  async function runDigest(uid: string, force: boolean) {
    const m = await member(uid);
    if (!m.digest || !m.email) { counts.skipped++; return; }
    if (!force) {
      if (localHour(m.tz) !== m.hour) return;
      const { count: recent } = await admin.from("oe_cards").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("alert_kind", "digest").gte("alerted_at", new Date(Date.now() - 20 * 3_600_000).toISOString());
      if ((recent ?? 0) > 0) return;
    }
    let cards = await pending(uid, false);
    let sample = false;
    // A dry run with nothing waiting renders from the roles currently clearing
    // screening, so the layout can be checked on real rows. Never sent.
    if (!cards.length && dry) {
      const { data: rows } = await admin.from("oe_matches")
        .select("id,opportunity_id,fit_band,created_at,opp:oe_opportunities!inner(title,issuer_raw,location,deadline,alive,kind)")
        .eq("user_id", uid).eq("screen_outcome", "survivor").eq("opp.alive", true).limit(5);
      cards = ((rows ?? []) as any[]).map((r) => ({ ...r, id: r.id }));
      sample = cards.length > 0;
    }
    if (!cards.length) { counts.skipped++; return; }
    const mail = render("digest", cards, m.lang, v);
    if (dry) { previews.push({ user_id: uid, kind: "digest", sample_from_survivors: sample, to: m.email ? "(member's address)" : null, local_hour: localHour(m.tz), chosen_hour: m.hour, timezone: m.tz, cards: cards.length, ...mail }); return; }
    try { await send(m.email, mail); await mark(cards.map((c) => c.id), "digest"); counts.digest_sent++; }
    catch (e) { counts.errors++; errors.push(String((e as Error).message)); }
  }

  let uids: string[] = [];
  if (onlyUser) uids = [onlyUser];
  else {
    const { data } = await admin.from("oe_cards").select("user_id").is("alerted_at", null).not("opportunity_id", "is", null)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(1000);
    uids = [...new Set((data ?? []).map((r: any) => String(r.user_id)))];
  }

  for (const uid of uids) {
    try {
      if (mode === "instant" || mode === "hourly") await runInstant(uid);
      if (mode === "digest" || mode === "hourly") await runDigest(uid, mode === "digest" && !!onlyUser);
    } catch (e) { counts.errors++; errors.push(String((e as Error).message)); }
  }
  return json({ ok: counts.errors === 0, counts, errors: errors.slice(0, 5), ...(dry ? { previews } : {}) });
}));
