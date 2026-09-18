/**
 * oe-issuer-people — records who publicly speaks for an issuer.
 *
 * It reads only the issuer's own public leadership, board or newsroom pages and
 * keeps a name, a public role title, the page it came from, and whether that
 * page presents the person as the organisation's voice. It never stores an
 * email address, a telephone number or anything personal — the table has
 * nowhere to put them, and the prompt is told not to return them.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-issuer-people";
const MODEL = "google/gemini-3-flash-preview";
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const PAGE_HINTS = /leadership|board|management|executive|governance|about|newsroom|media|press|القيادة|مجلس|الإدارة|الأخبار/i;

const SYSTEM =
  `You read one public organisation page and list the people it names in a public professional role. ` +
  `Return strict JSON {people:[{full_name, role_title, is_public_spokesperson, quote}]}. ` +
  `Include only people the page itself names with a role at this organisation. ` +
  `is_public_spokesperson is true only when the page presents the person as speaking for the organisation ` +
  `(a quoted statement, a press contact by role, a chief executive addressing the public). ` +
  `Never return an email address, a telephone number, a personal address or any personal detail. ` +
  `quote is a short verbatim run from the page that names the person. If the page names nobody, people is an empty array.`;

async function scrape(apiKey: string, url: string, withLinks = false) {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: withLinks ? ["markdown", "links"] : ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return null;
  const d = data?.data ?? data ?? {};
  return { markdown: String(d.markdown ?? ""), links: (d.links ?? []) as string[] };
}

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{7,}/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const issuerId = typeof body?.issuer_id === "string" ? body.issuer_id : null;
    const limit = Math.min(Number(body?.limit ?? 5), 20);

    const admin: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!firecrawlKey || !lovableKey) throw new Error("FIRECRAWL_API_KEY or LOVABLE_API_KEY missing");

    let q = admin.from("oe_issuers").select("id, canonical_name, domain").not("domain", "is", null).limit(limit);
    if (issuerId) q = q.eq("id", issuerId);
    const { data: issuers, error } = await q;
    if (error) throw new Error(error.message);

    const results: any[] = [];
    let stored = 0;

    for (const issuer of issuers ?? []) {
      const home = `https://${String(issuer.domain).replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
      const front = await scrape(firecrawlKey, home, true);
      if (!front) { results.push({ issuer: issuer.canonical_name, error: "home page unreadable" }); continue; }

      const pages = [home, ...(front.links ?? []).filter((l) => PAGE_HINTS.test(l)).slice(0, 3)];
      const found: any[] = [];

      for (const page of pages) {
        const doc = page === home ? front : await scrape(firecrawlKey, page);
        if (!doc?.markdown || doc.markdown.length < 200) continue;
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: `ORGANISATION: ${issuer.canonical_name}\nPAGE: ${page}\n\n${doc.markdown.slice(0, 12_000)}` },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (!res.ok) continue;
        const j = await res.json();
        await logAIUsage({
          function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: j?.usage?.prompt_tokens ?? 0, output_tokens: j?.usage?.completion_tokens ?? 0,
          metadata: { issuer_id: issuer.id, page },
        });
        const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
        for (const p of Array.isArray(parsed?.people) ? parsed.people : []) {
          const name = String(p?.full_name ?? "").trim();
          const role = String(p?.role_title ?? "").trim();
          // Belt and braces: a row carrying anything that looks like contact
          // detail is dropped rather than cleaned.
          if (!name || name.length < 4 || CONTACT.test(name) || CONTACT.test(role)) continue;
          if (!doc.markdown.toLowerCase().includes(name.toLowerCase())) continue;
          found.push({
            issuer_id: issuer.id, full_name: name, role_title: role || null,
            source_url: page, is_public_spokesperson: p?.is_public_spokesperson === true,
            verified_at: new Date().toISOString(),
          });
        }
      }

      const unique = new Map(found.map((p) => [p.full_name.toLowerCase(), p]));
      if (unique.size) {
        const { error: upErr } = await admin.from("oe_issuer_people")
          .upsert([...unique.values()], { onConflict: "issuer_id,full_name" });
        if (upErr) throw new Error(upErr.message);
        stored += unique.size;
      }
      results.push({ issuer: issuer.canonical_name, people: [...unique.values()].map((p) => `${p.full_name} — ${p.role_title ?? ""}`) });
    }

    return new Response(JSON.stringify({ ok: true, stored, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(FN, e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
