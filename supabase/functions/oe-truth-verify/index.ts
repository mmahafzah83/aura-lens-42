/**
 * THE TRUTH WORKER — a report is a claim, not a verdict.
 *
 * A member reporting a dead link or a missing quotation tells us something
 * real about their experience. It does not tell us the world changed: a dead
 * link may be a regional block or a two-minute outage, and a missing quote may
 * be a page that was edited after we read it.
 *
 * So a report enters 'pending' and this worker tries to reproduce it. The
 * backoff and the named causes are the same shape as the quote re-check:
 * 1h, 4h, 16h, three attempts, one named cause per failure.
 *
 *   reproduced      — we saw the same thing the member saw. Shared state moves.
 *   not_reproduced  — the page is fine from here. Retry with backoff; nothing
 *                     shared changes.
 *   member_specific — the page is fine from here and has been checked to the
 *                     attempt ceiling. The report is kept against that member
 *                     only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withRun } from "../_shared/oeRun.ts";
import { normaliseText } from "../_shared/textMatch.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const FN = "oe-truth-verify";
const MAX_ATTEMPTS = 3;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'").replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/\s+/g, " ").trim();
}

async function read(url: string): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, {
      redirect: "follow", signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AuraBot/1.0; +https://aura-intel.org)",
        "accept": "text/html,application/xhtml+xml", "accept-language": "en,ar;q=0.9",
      },
    });
    clearTimeout(timer);
    const text = res.ok ? pageText(await res.text()) : "";
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: "", error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

Deno.serve(withRun("truth_verify", async (req) => {
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

  try {
    const { data: due, error } = await admin.rpc("oe_truth_reports_due", { p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
    if (error) throw new Error(error.message);

    const results: any[] = [];
    for (const row of due ?? []) {
      const target = row.code === "dead_route" ? (row.route_url ?? row.source_url) : row.source_url;
      let status: "reproduced" | "not_reproduced" | "member_specific" = "not_reproduced";
      let cause = "not_reproduced_from_here";
      let evidence: Record<string, unknown> = {};

      if (!target) {
        status = "reproduced";
        cause = "no_page_recorded";
      } else {
        const page = await read(target);
        evidence = { url: target, http_status: page.status, fetch_error: page.error ?? null };
        if (row.code === "dead_route") {
          if (!page.ok && page.status >= 400 && page.status !== 429) { status = "reproduced"; cause = `page_returns_${page.status}`; }
          else if (!page.ok) { status = "not_reproduced"; cause = page.error ? "fetch_failed_here" : `transient_${page.status}`; }
          else { status = "not_reproduced"; cause = "page_returns_200"; }
        } else if (row.code === "quote_absent") {
          if (!page.ok) { status = "not_reproduced"; cause = "fetch_failed_here"; }
          else {
            const q = normaliseText(String(row.evidence_quote ?? ""));
            const t = normaliseText(page.text);
            if (q.length > 10 && t.includes(q)) { status = "not_reproduced"; cause = "quote_present_on_page"; }
            else { status = "reproduced"; cause = "quote_not_on_page"; }
          }
        } else {
          // listing_page, already_happened, wrong_issuer: a person read the page
          // and judged it. There is nothing here that can reproduce that
          // judgement, so it is kept against that member only.
          status = "member_specific";
          cause = "requires_human_judgement";
        }
      }

      if (status === "not_reproduced" && Number(row.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
        status = "member_specific";
        cause = `${cause}_after_${MAX_ATTEMPTS}_attempts`;
      }

      const { data: resolved, error: rErr } = await admin.rpc("oe_truth_report_resolve", {
        p_id: row.id, p_status: status, p_cause: cause, p_evidence: evidence,
      });
      if (rErr) throw new Error(rErr.message);

      if (status !== "reproduced") {
        await admin.from("ef_error_log").insert({
          function_name: FN, user_id: row.user_id, severity: "info",
          error_message: `Truth report ${status}: ${cause}`,
          context: { report_id: row.id, opportunity_id: row.opportunity_id, code: row.code, ...evidence },
        });
      }
      results.push({ report_id: row.id, code: row.code, status, cause, shared_state_changed: (resolved as any)?.shared_state_changed ?? false });
    }

    return json({ ok: true, checked: results.length, results });
  } catch (e) {
    await admin.from("ef_error_log").insert({
      function_name: FN, severity: "error", error_message: String((e as Error)?.message ?? e), context: {},
    });
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
}));
