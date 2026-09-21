/**
 * oe-extract-member-evidence — reads what the MEMBER'S OWN RECORD states.
 *
 * The mirror of oe-extract-scope. That one reads the posting once; this one
 * reads the member once, from four sources in order:
 *   1. his LinkedIn profile — the about text and his own position descriptions
 *   2. his CV and similar professional records, through their stored chunks
 *   3. his own answers to the assessment
 *   4. his writing — for what he STATES, never for scope
 *
 * Every claim carries the verbatim sentence it came from, and a claim whose
 * quote cannot be found again in its source is not stored. No third-party name,
 * email or telephone number is stored in any claim or quote.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { logEfError } from "../_shared/observe.ts";
import { checkSpendCap } from "../_shared/spendCap.ts";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import {
  MEMBER_EVIDENCE_INSTRUCTION, verifyMemberClaims, type MemberClaim,
} from "../_shared/memberEvidence.ts";

const FN = "oe-extract-member-evidence";
const MODEL = "openai/gpt-6-astra";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Group = "profile" | "cv" | "assessment" | "writing";

/** One streamed Responses call. Reasoning models run long; never buffer. */
async function ask(key: string, instructions: string, input: string): Promise<{ raw: any; usage: any }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: "member_claims",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              claims: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    kind: { type: "string" },
                    claim: { type: "string" },
                    quote: { type: "string" },
                    position_ref: { type: ["string", "null"] },
                  },
                  required: ["kind", "claim", "quote", "position_ref"],
                },
              },
            },
            required: ["claims"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "", text = "", usage: any = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const raw = l.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const ev = JSON.parse(raw);
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
        if (ev.response?.usage) usage = ev.response.usage;
      } catch { /* partial frame */ }
    }
  }
  try { return { raw: JSON.parse(text.trim()), usage }; } catch { return { raw: { claims: [] }, usage }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const key = Deno.env.get("LOVABLE_API_KEY") ?? "";
  if (!key) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = String(body.user_id ?? "");
  const only: Group[] = Array.isArray(body.groups) && body.groups.length
    ? body.groups as Group[]
    : ["profile", "cv", "assessment", "writing"];
  if (!userId) return json({ error: "user_id required" }, 400);

  const counts = {
    groups_read: [] as string[], calls: 0, kept: 0, stored: 0, duplicates: 0,
    dropped: 0, dropped_reasons: {} as Record<string, number>,
    stopped_at_cap: null as null | string,
    input_tokens: 0, output_tokens: 0,
  };

  const store = async (group: Group, claims: MemberClaim[], meta: {
    source_table: string; source_id?: string | null; source_field: string; confidence: number;
  }) => {
    for (const c of claims) {
      const { error, data } = await admin.from("oe_member_evidence").insert({
        user_id: userId, kind: c.kind, claim: c.claim, quote: c.quote,
        source_table: meta.source_table, source_id: meta.source_id ?? null,
        source_field: meta.source_field, position_ref: c.position_ref,
        confidence: meta.confidence,
        // His own record, or reading material. Only the first may ground a card.
        own_record: OWN_RECORD_SOURCES.has(meta.source_table),
      }).select("id").maybeSingle();

      if (error) {
        if (String(error.code) === "23505") counts.duplicates++;
        else await logEfError(admin, { function_name: FN, error: new Error(`${group}: ${error.message}`), severity: "low", context: { user_id: userId } });
      } else if (data) counts.stored++;
    }
  };

  const run = async (group: Group, instructions: string, input: string, hay: string, meta: {
    source_table: string; source_id?: string | null; source_field: string; confidence: number;
  }) => {
    const cap = await checkSpendCap(admin, FN);
    if (!cap.allowed) {
      counts.stopped_at_cap = `daily call ceiling ${cap.used}/${cap.cap} — stopped before the ${group} pass`;
      return false;
    }
    counts.calls++;
    const { raw, usage } = await ask(key, instructions, input);
    counts.input_tokens += Number(usage?.input_tokens ?? 0);
    counts.output_tokens += Number(usage?.output_tokens ?? 0);
    await logAIUsage({
      function_name: FN, provider: "lovable", model: MODEL,
      input_tokens: Number(usage?.input_tokens ?? 0), output_tokens: Number(usage?.output_tokens ?? 0),
      metadata: { user_id: userId, group },
    });
    const { kept, dropped } = verifyMemberClaims(raw, hay);
    counts.kept += kept.length;
    counts.dropped += dropped.length;
    for (const d of dropped) counts.dropped_reasons[d.reason] = (counts.dropped_reasons[d.reason] ?? 0) + 1;
    await store(group, kept, meta);
    counts.groups_read.push(group);
    return true;
  };

  try {
    // ── 1. his profile: the about text and his own position descriptions ──
    if (only.includes("profile")) {
      const { data: snap } = await admin.from("linkedin_profile_snapshots")
        .select("id, about, headline, experience")
        .eq("user_id", userId).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      const experience: any[] = Array.isArray((snap as any)?.experience) ? (snap as any).experience : [];
      const blocks = experience
        .map((e) => ({
          ref: `${String(e?.position ?? e?.title ?? "").trim()} at ${String(e?.companyName ?? e?.company ?? "").trim()}`,
          text: String(e?.description ?? "").trim(),
        }))
        .filter((b) => b.text.length > 40);
      const about = String((snap as any)?.about ?? "").trim();
      if (snap && (blocks.length || about.length > 40)) {
        const payload = [
          about ? `ABOUT:\n${about}` : "",
          ...blocks.map((b) => `POSITION: ${b.ref}\n${b.text}`),
        ].filter(Boolean).join("\n\n");
        await run("profile", MEMBER_EVIDENCE_INSTRUCTION.profile, payload.slice(0, 24_000), payload, {
          source_table: "linkedin_profile_snapshots", source_id: (snap as any).id,
          source_field: "about+experience.description", confidence: 0.9,
        });
      }
    }

    // ── 2. his CV, through its stored chunks ─────────────────────────────
    if (only.includes("cv") && !counts.stopped_at_cap) {
      const { data: docs } = await admin.from("documents")
        .select("id, filename, display_title, document_type, cv_label")
        .eq("user_id", userId)
        .or("document_type.ilike.%cv%,document_type.ilike.%resume%,cv_label.not.is.null");
      for (const d of (docs ?? [])) {
        if (counts.stopped_at_cap) break;
        const { data: chunks } = await admin.from("document_chunks")
          .select("content").eq("document_id", (d as any).id).order("chunk_index").limit(40);
        const text = (chunks ?? []).map((c: any) => String(c.content ?? "")).join("\n").trim();
        if (text.length < 200) continue;
        await run("cv", MEMBER_EVIDENCE_INSTRUCTION.cv, text.slice(0, 24_000), text, {
          source_table: "documents", source_id: (d as any).id,
          source_field: "document_chunks.content", confidence: 0.9,
        });
      }
    }

    // ── 3. his own answers — stated by him, so confidence is 1.0 ─────────
    if (only.includes("assessment") && !counts.stopped_at_cap) {
      const { data: prof } = await admin.from("diagnostic_profiles")
        .select("brand_assessment_answers").eq("user_id", userId).maybeSingle();
      const { data: sessions } = await admin.from("assessment_sessions")
        .select("id, state").eq("user_id", userId).order("created_at", { ascending: false }).limit(12);
      const answerBlocks: string[] = [];
      const answers = (prof as any)?.brand_assessment_answers;
      if (answers && typeof answers === "object") {
        for (const [q, a] of Object.entries(answers)) {
          const text = Array.isArray(a) ? a.join("; ") : String(a ?? "");
          if (text.trim().length > 8) answerBlocks.push(`${q}: ${text.trim()}`);
        }
      }
      for (const s of (sessions ?? [])) {
        // only his own answers; a session's machine reading of anyone is not his statement
        const own = (s as any)?.state?.answers;
        if (!own || typeof own !== "object") continue;
        for (const [q, a] of Object.entries(own)) {
          const text = Array.isArray(a) ? a.join("; ") : String(a ?? "");
          if (text.trim().length > 8) answerBlocks.push(`${q}: ${text.trim()}`);
        }
      }
      const payload = answerBlocks.join("\n");
      if (payload.length > 80) {
        await run("assessment", MEMBER_EVIDENCE_INSTRUCTION.assessment, payload.slice(0, 20_000), payload, {
          source_table: "diagnostic_profiles", source_id: null,
          source_field: "brand_assessment_answers+assessment_sessions.state.answers", confidence: 1.0,
        });
      }
    }

    // ── 4. his writing — what he STATES, never what he ran ───────────────
    if (only.includes("writing") && !counts.stopped_at_cap) {
      const { data: frags } = await admin.from("evidence_fragments")
        .select("content, title").eq("user_id", userId)
        .order("confidence", { ascending: false }).limit(40);
      const { data: posts } = await admin.from("linkedin_posts")
        .select("post_text").eq("user_id", userId)
        .order("published_at", { ascending: false }).limit(40);
      const payload = [
        ...(frags ?? []).map((f: any) => String(f.content ?? "").trim()),
        ...(posts ?? []).map((p: any) => String(p.post_text ?? "").trim()),
      ].filter((t) => t.length > 60).join("\n\n---\n\n");
      if (payload.length > 200) {
        await run("writing", MEMBER_EVIDENCE_INSTRUCTION.writing, payload.slice(0, 24_000), payload, {
          source_table: "linkedin_posts", source_id: null,
          source_field: "evidence_fragments.content+linkedin_posts.post_text", confidence: 0.6,
        });
      }
    }

    await admin.from("oe_runs").insert({
      run_kind: "extract_member_evidence", started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(), outcome: "ok", counts,
    });
    return json({ ok: true, counts });
  } catch (e) {
    await logEfError(admin, { function_name: FN, error: e as Error, severity: "error", context: { user_id: userId, counts } });
    return json({ ok: false, error: (e as Error).message, counts }, 500);
  }
});
