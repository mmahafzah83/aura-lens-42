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

/** The text we KEEP is the text the verdict must stand on. When the quote sits
 *  beyond the first slice, the window around it is kept instead, so a quote is
 *  never "verified" against text nobody can read back. */
function storedSlice(text: string, quote: string, size = 12_000): string {
  if (text.length <= size) return text;
  const idx = normaliseText(text).indexOf(normaliseText(quote));
  if (idx < 0 || !quote) return text.slice(0, size);
  const approx = Math.max(0, Math.round(idx * (text.length / Math.max(1, normaliseText(text).length))) - Math.floor(size / 2));
  return text.slice(approx, approx + size);
}

/** A listing or menu shell: plenty of links, no article. We record what it was
 *  and make nothing of it. */
function isShellPage(html: string, text: string): boolean {
  const links = (html.match(/<a\s/gi) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return words < 250 || (links > 60 && words < 700);
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
  const limit = Math.min(Number(body?.limit ?? 20), 500);
  const only: string[] = Array.isArray(body?.opportunity_ids) ? body.opportunity_ids : [];
  // 'stored' reads nothing from the web: it holds every alive record against
  // the text we actually kept. A quote nobody can read back in our own copy is
  // not a verified quote, whatever a live page says today.
  const mode: "fetch" | "stored" = body?.mode === "stored" ? "stored" : "fetch";
  const SELECT = "id, source_url, evidence_quote, content_hash, quote_attempts, raw, kind, access_state, deadline, route_url, language, title";

  try {
    let due: any[] = [];
    if (mode === "stored") {
      const base = admin.from("oe_opportunities").select(SELECT).eq("alive", true);
      const { data, error } = only.length ? await base.in("id", only) : await base.limit(Math.max(limit, 500));

      if (error) throw new Error(error.message);
      due = data ?? [];
    } else if (only.length) {
      // A named run ignores the backoff clock but not the attempt ceiling.
      const { data } = await admin.from("oe_opportunities").select(SELECT).in("id", only);
      due = data ?? [];
    } else {
      const { data, error } = await admin.rpc("oe_quote_recheck_due", { p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
      if (error) throw new Error(error.message);
      const ids = (data ?? []).map((r: any) => r.id);
      if (ids.length) {
        const { data: rows } = await admin.from("oe_opportunities").select(SELECT).in("id", ids);
        due = rows ?? [];
      }
    }

    const results: any[] = [];
    for (const row of due) {
      const quote = String(row.evidence_quote ?? "");
      const stored = String(row.raw?.page_text ?? "");
      const attempts = Number(row.quote_attempts ?? 0) + (mode === "stored" ? 0 : 1);
      let reason: "fetch_failed" | "page_changed" | "quote_absent" | "quote_not_in_text" | "shell_page" | null = null;
      let detail = "";
      let verified = false;
      let hash: string | null = null;
      let readResult: string | null = null;
      let newStored: string | null = null;

      if (mode === "stored") {
        verified = quoteIsPresent(quote, stored);
        if (!verified) {
          reason = "quote_not_in_text";
          detail = "the quote is not in the page text we kept";
        }
      } else {
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
            const html = await res.text();
            const text = pageText(html);
            hash = await sha256(text);
            if (!text) { reason = "fetch_failed"; detail = "empty body"; }
            else if (isShellPage(html, text)) {
              readResult = "shell_page";
              reason = "shell_page";
              detail = "a listing or menu page, not an article";
            } else if (quoteIsPresent(quote, text)) {
              verified = true;
              readResult = "article";
              // The verdict and the text we keep must agree from now on.
              newStored = storedSlice(text, quote);
            } else if (row.content_hash && hash !== row.content_hash) {
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
      }

      const abandoned = !verified && attempts >= MAX_ATTEMPTS;
      await admin.from("oe_opportunities").update({
        quote_verified: verified,
        quote_attempts: attempts,
        quote_last_attempt_at: new Date().toISOString(),
        quote_fail_reason: verified ? null : reason,
        quote_fail_detail: verified ? null : detail,
        verify_reason: verified ? null : reason,
        quote_abandoned: abandoned,
        ...(readResult ? { read_result: readResult } : {}),
        ...(verified && hash ? { content_hash: hash } : {}),
        ...(newStored ? { raw: { ...(row.raw ?? {}), page_text: newStored } } : {}),
      }).eq("id", row.id);

      // A SHAPE MAY NOT OUTRANK ITS STATE. A seat that states no closing date
      // and no way in is not a confirmed opportunity; it is something we saw.
      let downgraded = false;
      if (row.access_state === "confirmed_opportunity" && row.kind === "board_seat"
        && (!row.deadline || !row.route_url)) {
        await admin.from("oe_opportunities").update({
          access_state: "observed_event",
          access_state_reason: "board seat with no closing date and no way in — recorded as something we saw",
          access_state_at: new Date().toISOString(),
        }).eq("id", row.id);
        downgraded = true;
      }

      // A verdict of 'quote_not_verified' was reached on a quote that now
      // reads. It is stale, and the judge's own resume guard would keep it
      // that way for a day, so the verdict is cleared and the record re-enters
      // the next review run. Nothing is promoted here — only re-opened.
      if (verified) {
        // judged_at is the resume guard: anything judged inside a day is
        // skipped. Dating the stale verdict two days back re-opens it without
        // pretending it was never judged.
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
        await admin.from("oe_matches")
          .update({ judged_at: twoDaysAgo })
          .eq("opportunity_id", row.id).eq("gate_reason", "quote_not_verified");
      }

      if (!verified && mode !== "stored") {
        await admin.from("ef_error_log").insert({
          function_name: FN,
          severity: reason === "quote_absent" ? "error" : "warn",
          error_message: `Quote not verified: ${reason}`,
          context: { opportunity_id: row.id, source_url: row.source_url, attempt: attempts, detail, abandoned },
        });
      }
      results.push({ id: row.id, source_url: row.source_url, verified, reason, detail, attempt: attempts, abandoned, downgraded });
    }

    const verifiedCount = results.filter((r) => r.verified).length;
    return json({ ok: true, mode, checked: results.length, verified: verifiedCount, results: mode === "stored" ? results.slice(0, 40) : results });

  } catch (e) {
    await admin.from("ef_error_log").insert({
      function_name: FN, severity: "error",
      error_message: String((e as Error)?.message ?? e), context: {},
    });
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
