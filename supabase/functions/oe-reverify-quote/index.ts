/**
 * THE QUOTE RE-CHECK — failure becomes a queue, not a grave.
 *
 * The grounding rule does not move: a card without a verified quote does not
 * render, and nothing here loosens that. What was wrong is that an unverified
 * quote was terminal — one failed read and the record fell into the writing
 * lane for good, taking the best thing on the shelf with it.
 *
 * So the failure gets a counter, a clock and a named cause. Each pass fetches
 * the source page again, looks for the recorded quote in it, and writes back
 * one of three verdicts:
 *
 *   fetch_failed  — we never saw the page. The status is kept, because a 403
 *                   from a ministry site is an access finding about us, not a
 *                   fault in the record.
 *   page_changed  — the page came back, but its text no longer holds the
 *                   quote and the page itself has changed since we read it.
 *   quote_absent  — the page came back unchanged and the quote is not in it.
 *                   That is the serious one: we wrote down something the page
 *                   never said.
 *
 * Backoff is 1h, 4h, 16h; at three attempts the record is abandoned, with its
 * last cause kept on the row. Nothing is deleted and nothing is invented.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normaliseText } from "../_shared/textMatch.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const FN = "oe-reverify-quote";
const MAX_ATTEMPTS = 3;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Tags, scripts and entities out. What is left is what a reader would see. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'").replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/\s+/g, " ").trim();
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Present means present. This is the SAME test the harvester applied when the
 * quote was first taken — normalised for case, punctuation and Arabic
 * orthography, then whole containment. No fuzzy match, no partial credit, no
 * shortening of the quote to make it fit. The grounding rule does not move.
 */
function quoteIsPresent(quote: string, text: string): boolean {
  const q = normaliseText(quote);
  const t = normaliseText(text);
  if (q.length <= 10 || !t) return false;
  return t.includes(q);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !service) return json({ error: "Backend credentials missing" }, 500);
  if (!((secret && req.headers.get("x-cron-secret") === secret) || bearer === service)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(url, service);
  let body: any = {};
  try { body = await req.json(); } catch { /* a cron sends nothing */ }
  const limit = Math.min(Number(body?.limit ?? 20), 50);
  const only: string[] = Array.isArray(body?.opportunity_ids) ? body.opportunity_ids : [];

  try {
    let due: any[] = [];
    if (only.length) {
      // A named run ignores the backoff clock but not the attempt ceiling.
      const { data } = await admin.from("oe_opportunities")
        .select("id, source_url, evidence_quote, content_hash, quote_attempts")
        .in("id", only);
      due = data ?? [];
    } else {
      const { data, error } = await admin.rpc("oe_quote_recheck_due", { p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
      if (error) throw new Error(error.message);
      due = data ?? [];
    }

    const results: any[] = [];
    for (const row of due) {
      const attempts = Number(row.quote_attempts ?? 0) + 1;
      let reason: "fetch_failed" | "page_changed" | "quote_absent" | null = null;
      let detail = "";
      let verified = false;
      let hash: string | null = null;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        const res = await fetch(row.source_url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": "Mozilla/5.0 (compatible; AuraBot/1.0; +https://aura-intel.org)",
            "accept": "text/html,application/xhtml+xml",
            "accept-language": "en,ar;q=0.9",
          },
        });
        clearTimeout(timer);
        if (!res.ok) {
          reason = "fetch_failed";
          detail = `HTTP ${res.status}`;
        } else {
          const text = pageText(await res.text());
          hash = await sha256(text);
          if (!text) { reason = "fetch_failed"; detail = "empty body"; }
          else if (quoteIsPresent(String(row.evidence_quote ?? ""), text)) verified = true;
          else if (row.content_hash && hash !== row.content_hash) {
            reason = "page_changed";
            detail = "page text differs from the copy we read";
          } else {
            reason = "quote_absent";
            detail = "page reachable and unchanged; the quote is not in it";
          }
        }
      } catch (e) {
        reason = "fetch_failed";
        detail = String((e as Error)?.message ?? e).slice(0, 200);
      }

      const abandoned = !verified && attempts >= MAX_ATTEMPTS;
      await admin.from("oe_opportunities").update({
        quote_verified: verified,
        quote_attempts: attempts,
        quote_last_attempt_at: new Date().toISOString(),
        quote_fail_reason: verified ? null : reason,
        quote_fail_detail: verified ? null : detail,
        quote_abandoned: abandoned,
        ...(verified && hash ? { content_hash: hash } : {}),
      }).eq("id", row.id);

      if (!verified) {
        await admin.from("ef_error_log").insert({
          function_name: FN,
          severity: reason === "quote_absent" ? "error" : "warn",
          error_message: `Quote not verified: ${reason}`,
          context: { opportunity_id: row.id, source_url: row.source_url, attempt: attempts, detail, abandoned },
        });
      }
      results.push({ id: row.id, source_url: row.source_url, verified, reason, detail, attempt: attempts, abandoned });
    }

    return json({ ok: true, checked: results.length, results });
  } catch (e) {
    await admin.from("ef_error_log").insert({
      function_name: FN, severity: "error",
      error_message: String((e as Error)?.message ?? e), context: {},
    });
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
