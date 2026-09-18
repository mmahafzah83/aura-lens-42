/**
 * oe-backfill-routes — records read before the way-in rules existed carry no
 * route_url/route_kind, so "no record has a way in" was an artifact of the old
 * reader rather than a reading. This re-runs the p2-2.0 extraction over the
 * page text already stored on the row — no re-fetch, no Firecrawl — and writes
 * route_url, route_kind and, when the page turns out to be a recap or a
 * listing, alive=false.
 *
 * A live row with no stored page text cannot be re-read honestly, so its feed
 * is put back on the queue; the reader now stores page text on the way through.
 * A route is never invented: no place to apply means route_kind 'none'.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-backfill-routes";
const MODEL = "google/gemini-3-flash-preview";
const READER_VERSION = "p2-2.0";
const ROUTE_KINDS = [
  "application", "nomination", "tender", "call_for_speakers", "registration", "contact", "none",
];

const P2_SYSTEM =
  `You turn one web page or message into at most one opportunity record for senior professionals, or null. ` +
  `Return strict JSON {is_opportunity:boolean, chair_type:'board'|'mandate'|'role'|'room'|'speaking'|'media'|'advisory'|'award'|'learning'|null, ` +
  `time_kind:'open_now'|'early_signal'|null, title, scope (<=60 words), issuer_raw, sector, seniority_band:'work'|'table'|'room'|null, ` +
  `location, remote:boolean|null, requirements:[{text, quote}], deadline:YYYY-MM-DD|null, signal_date:YYYY-MM-DD|null, ` +
  `evidence_quote (a verbatim sentence from the page that proves chair_type and, when present, the deadline), ` +
  `route_url (the page where a person actually applies, nominates, registers, submits or writes in — null when the page has none), ` +
  `route_kind:'application'|'nomination'|'tender'|'call_for_speakers'|'registration'|'contact'|'none', ` +
  `language:'ar'|'en', extraction_confidence:0-1}. ` +
  `Rules: null over guess; evidence_quote must be copied verbatim; early_signal is for facts that imply a chair will open ` +
  `(listing/IPO application, new strategy or entity, director term ending or resignation, large digital contract awarded, event dates announced, executive appointment); ` +
  `open_now needs a route or a deadline; seniority_band: work = senior professional, table = director/head, room = C-suite/board. ` +
  `A calendar, directory, aggregator, newsroom index, listing page, company-governance profile page or 'about us' page is NEVER an opportunity — ` +
  `only one specific event, vacancy, notice, mandate, tender or announcement is. If the page describes many events or many roles, return is_opportunity=false. ` +
  `If the page reports an event or a call that has already taken place or already closed, is_opportunity=false — a recap is not a chair. ` +
  `route_url must be a real link found on the page; never invent one, and never use the page's own address unless that page itself takes the submission.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normaliseJson(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("unparseable model output");
  }
}

async function readStored(key: string, header: string, pageText: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.1, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: P2_SYSTEM },
        { role: "user", content: `${header}\n\nPAGE TEXT:\n${pageText.slice(0, 12_000)}` },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || "";
}

const stripTags = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Firecrawl when a key exists, otherwise a plain read with a browser agent. */
async function fetchPageText(url: string, firecrawlKey: string): Promise<string> {
  if (firecrawlKey) {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
        signal: AbortSignal.timeout(40_000),
      });
      if (r.ok) {
        const j = await r.json();
        const md = squash(stripTags(String(j?.markdown ?? j?.data?.markdown ?? "")));
        if (md.length >= 200) return md;
      }
    } catch { /* fall through to the plain read */ }
  }
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en,ar;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return squash(stripTags(await r.text()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const body = await req.json().catch(() => ({} as any));
  const dryRun = body.dry_run === true;
  const limit = Math.max(1, Math.min(100, Number(body.limit ?? 50)));
  /** Re-queueing a feed does not re-read a record that already exists, so a row
   *  with no stored text is read from its own page here. */
  const refetch = body.refetch === true;
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";

  const startedAt = new Date().toISOString();
  const counts = {
    alive: 0, backfilled: 0, retired: 0, needs_refetch: 0, refetched: 0, feeds_requeued: 0, errors: 0,
  };
  const byRouteKind: Record<string, number> = {};

  try {
    let q = admin
      .from("oe_opportunities")
      .select("id, title, source_url, feed_id, raw")
      .eq("alive", true);
    if (body.only_unexamined === true) q = q.eq("route_kind", "not_checked");
    const { data: rows, error } = await q.limit(limit);
    if (error) throw new Error(error.message);
    counts.alive = (rows ?? []).length;

    const refetchFeeds = new Set<string>();

    for (const o of rows ?? []) {
      let pageText = String((o.raw as any)?.page_text ?? "");
      if (pageText.trim().length < 200) {
        counts.needs_refetch++;
        if (o.feed_id) refetchFeeds.add(o.feed_id);
        if (!refetch || !o.source_url || dryRun) continue;
        try {
          pageText = await fetchPageText(String(o.source_url), firecrawlKey);
          if (pageText.length < 200) continue;
          counts.refetched++;
          await admin.from("oe_opportunities")
            .update({ raw: { ...(o.raw as any ?? {}), page_text: pageText.slice(0, 12_000) } })
            .eq("id", o.id);
          (o as any).raw = { ...(o.raw as any ?? {}), page_text: pageText.slice(0, 12_000) };
        } catch (e) {
          counts.errors++;
          console.error(`[${FN}] refetch ${o.id}: ${String((e as Error).message ?? e).slice(0, 160)}`);
          continue;
        }
      }
      if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
      try {
        const header = `URL: ${o.source_url ?? ""}\nTITLE: ${o.title ?? ""}`;
        const rec = normaliseJson(await readStored(lovableKey, header, pageText));
        const isOpp = rec?.is_opportunity === true;
        const routeUrl = typeof rec?.route_url === "string" && /^https?:/i.test(rec.route_url)
          ? rec.route_url : null;
        const routeKind = ROUTE_KINDS.includes(String(rec?.route_kind)) ? String(rec.route_kind) : "none";

        if (!isOpp) {
          counts.retired++;
          byRouteKind.retired = (byRouteKind.retired ?? 0) + 1;
          if (!dryRun) {
            await admin.from("oe_opportunities").update({
              alive: false,
              raw: { ...(o.raw as any ?? {}), backfill: { version: READER_VERSION, reason: "not_an_opportunity", at: new Date().toISOString() } },
            }).eq("id", o.id);
          }
          continue;
        }

        counts.backfilled++;
        byRouteKind[routeKind] = (byRouteKind[routeKind] ?? 0) + 1;
        if (!dryRun) {
          await admin.from("oe_opportunities").update({
            route_url: routeUrl,
            route_kind: routeKind,
            raw: { ...(o.raw as any ?? {}), backfill: { version: READER_VERSION, at: new Date().toISOString() } },
          }).eq("id", o.id);
        }
      } catch (e) {
        counts.errors++;
        console.error(`[${FN}] ${o.id}: ${String((e as Error).message ?? e).slice(0, 200)}`);
      }
    }

    // Live rows with nothing stored: only a fresh read can answer honestly.
    if (!dryRun) {
      for (const feedId of refetchFeeds) {
        const { data: feed } = await admin.from("oe_feeds")
          .select("id, kind, url, lane, active, terms_ok").eq("id", feedId).maybeSingle();
        if (!feed?.active || !feed?.terms_ok) continue;
        const { error: qErr } = await admin.from("job_queue").insert({
          job_type: "oe_fetch_feed",
          user_id: null,
          payload: { feed_id: feed.id, kind: feed.kind, url: feed.url, lane: feed.lane },
          priority: 1,
          max_attempts: 3,
        });
        if (!qErr) counts.feeds_requeued++;
        else if ((qErr as any).code !== "23505") throw new Error(qErr.message);
      }
    }

    if (!dryRun) {
      await admin.from("oe_runs").insert({
        run_kind: "backfill_routes", started_at: startedAt,
        finished_at: new Date().toISOString(), outcome: "ok",
        counts: { ...counts, by_route_kind: byRouteKind },
      });
    }

    return json({ ok: true, dry_run: dryRun, counts, by_route_kind: byRouteKind });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: { counts } });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
