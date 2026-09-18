/**
 * oe-reextract-asks — re-reads the pages we already hold and separates two
 * things the first reader confused: what is asked of a PERSON (requirements)
 * and what is attached to the deal or the institution (conditions). It also
 * records how we came to see the record at all (discovery_kind), so the screen
 * can say plainly when a member would not have found it on his own.
 *
 * It never re-decides whether a record is an opportunity, never fetches, and
 * only touches rows that already carry stored page text.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-reextract-asks";
const MODEL = "google/gemini-3-flash-preview";
const VERSION = "p2-3.0";
const DISCOVERY_KINDS = [
  "corporate_event_inference", "term_ending", "new_entity", "departure", "arabic_only_source", "posted_opening",
];

const SYSTEM =
  `You read one page about one opportunity and separate two different ideas. ` +
  `Return strict JSON {requirements:[{text, quote}], conditions:[{text, quote}], discovery_kind, note}. ` +
  `requirements means ONLY what is asked of a candidate, nominee, bidder or speaker: qualifications, years of experience, ` +
  `licences, documents, membership, nationality, or other eligibility a PERSON can hold or fail to hold. ` +
  `Anything attached to the transaction or the institution — regulatory approvals, competition clearance, shareholder or ` +
  `assembly votes, closing conditions, governance procedure — is NOT a requirement; put it in conditions. ` +
  `If the page states nothing asked of a person, requirements is an empty array. Never move a condition across to fill it. ` +
  `Read the whole page, including Arabic body text buried among navigation links: nomination notices often list the forms ` +
  `a candidate must file, the fit-and-proper declaration, the cap on how many boards a person may sit on, and the ` +
  `experience asked for. Those are requirements. ` +
  `Every quote must be copied verbatim from the page. ` +
  `discovery_kind is one of corporate_event_inference (a deal, restructuring or award implying a mandate nobody posted), ` +
  `term_ending (a board or committee term running out), new_entity (a new authority, company or programme being formed), ` +
  `departure (a named executive leaving), arabic_only_source (an Arabic page carrying a fact English sources do not), ` +
  `posted_opening (an ordinary published call anyone can read).`;

function normalise(s: string) {
  return String(s ?? "").replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

async function readOne(key: string, page: string, title: string, scope: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `TITLE: ${title}\nSCOPE: ${scope}\n\nPAGE:\n${page.slice(0, 12_000)}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
}

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
    const dryRun = body?.dry_run === true;
    const limit = Math.min(Number(body?.limit ?? 50), 100);
    const onlyId = typeof body?.opportunity_id === "string" ? body.opportunity_id : null;

    const admin: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

    let q = admin.from("oe_opportunities")
      .select("id, title, scope, raw, requirements, language")
      .eq("alive", true).limit(limit);
    if (onlyId) q = q.eq("id", onlyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const results: any[] = [];
    let changed = 0, skipped = 0, failed = 0;

    for (const o of rows ?? []) {
      const page = String((o.raw as any)?.page_text ?? "");
      if (page.length < 200) { skipped++; continue; }
      try {
        const out = await readOne(lovableKey, page, o.title ?? "", o.scope ?? "");
        const hay = normalise(page);
        const keep = (arr: any) => (Array.isArray(arr) ? arr : [])
          .filter((r) => r?.text && (!r.quote || hay.includes(normalise(r.quote))))
          .slice(0, 8);
        const requirements = keep(out.requirements);
        const conditions = keep(out.conditions);
        const discovery = DISCOVERY_KINDS.includes(String(out.discovery_kind))
          ? String(out.discovery_kind) : "posted_opening";
        const raised = (Array.isArray(out.requirements) ? out.requirements.length : 0) +
          (Array.isArray(out.conditions) ? out.conditions.length : 0);

        results.push({
          id: o.id, title: o.title,
          before: (o.requirements as any[])?.map((r: any) => r?.text) ?? [],
          requirements: requirements.map((r: any) => r.text),
          conditions: conditions.map((r: any) => r.text),
          dropped_for_unverified_quote: raised - requirements.length - conditions.length,
          discovery_kind: discovery,
        });

        if (!dryRun) {
          const { error: upErr } = await admin.from("oe_opportunities").update({
            requirements, conditions, discovery_kind: discovery,
            raw: { ...((o.raw as any) ?? {}), asks_version: VERSION },
          }).eq("id", o.id);
          if (upErr) throw new Error(upErr.message);
          changed++;
        }
        await logAIUsage({
          function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: Math.ceil(page.length / 4), metadata: { opportunity_id: o.id, prompt_version: VERSION },
        });
      } catch (e) {
        failed++;
        results.push({ id: o.id, title: o.title, error: (e as Error)?.message });
      }
    }

    return new Response(JSON.stringify({ ok: true, dry_run: dryRun, changed, skipped, failed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(FN, e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
