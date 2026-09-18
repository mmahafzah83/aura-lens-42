/**
 * oe-triage — the cheap filter between the harvest and the reader.
 *
 * Deterministic rules first, because they cost nothing and they are the ones
 * we can explain. Then one batched embedding call, and a score that is simply
 * how close the line comes to what our members have done, want and stand for.
 * Only the highest scores are promoted to the expensive reader, and only up to
 * a budget we set, so cost stays a number we choose rather than one we discover.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logEfError } from "../_shared/observe.ts";
import { isAggregator } from "../_shared/oeGuards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-triage";
const EMBED_MODEL = "text-embedding-3-small";

// Goods and works, not advice. A person does not sit in these.
const GOODS_RE =
  /\b(supply of|purchase of|procurement of (goods|materials|equipment)|printing|vehicles?|furniture|catering|cleaning|maintenance of|construction of|building of|spare parts|stationery|uniforms)\b|توريد|شراء|طباعة|أثاث|مركبات|إعاشة|نظافة|صيانة|إنشاء مبنى/i;
const ADVISORY_RE =
  /\b(consult|advisor|advisory|expert|technical assistance|expression of interest|feasibility|strategy|governance|transformation|study|design of|capacity building)\b|استشار|خبير|دراسة|حوكمة|تحول|استراتيجي/i;

// Structural patterns worth reading whatever the score says.
const STRUCTURAL_RE =
  /\b(board nomination|nomination (for|of) (board|directors)|opening of (the )?nomination|term (is )?ending|end of term|call for speakers|speaker (applications|submissions)|expression of interest|advisory (committee|board|panel)|request for proposal[s]? for (consult|advis)|call for (papers|proposals)|invitation to (nominate|submit))\b|فتح باب الترشح|الترشح لعضوية مجلس|دعوة للمتحدثين|إبداء الاهتمام|اللجنة الاستشارية/i;

// Places we do not serve, named as a place rather than as a passing mention.
const FAR_PLACE_RE =
  /\b(madagascar|nepal|bangladesh|vietnam|honduras|bolivia|paraguay|mongolia|zambia|malawi|uganda|tanzania|myanmar|cambodia|laos|haiti|kosovo|moldova|papua new guinea|sierra leone|burkina faso|benin|togo|mali|niger|chad|guinea|liberia|rwanda|burundi|lesotho|eswatini|guyana|suriname|timor-leste|kyrgyz|tajikistan|uzbekistan|turkmenistan)\b/i;
const HOME_RE =
  /\b(saudi|ksa|riyadh|jeddah|dammam|khobar|makkah|madinah|neom|gcc|gulf|uae|emirat|dubai|abu dhabi|qatar|doha|kuwait|bahrain|manama|oman|muscat|jordan|egypt|cairo|mena|middle east)\b|السعودي|الرياض|جدة|الخليج|الإمارات|قطر|الكويت|البحرين|عمان|الأردن|مصر/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function asVector(v: unknown): number[] | null {
  const arr = typeof v === "string" ? JSON.parse(v) : v;
  return Array.isArray(arr) && arr.length ? arr as number[] : null;
}

/** One batched embedding call for the whole batch — the only paid call here. */
async function embedBatch(key: string, inputs: string[]): Promise<{ vectors: (number[] | null)[]; tokens: number }> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`embed_http_${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = await r.json();
  const vectors: (number[] | null)[] = inputs.map(() => null);
  for (const d of body.data ?? []) vectors[d.index] = d.embedding;
  return { vectors, tokens: body.usage?.total_tokens ?? 0 };
}

/** The deterministic pass. Returns a reason to reject, or null to continue. */
function deterministicReject(title: string, snippet: string, url: string): string | null {
  const text = `${title} ${snippet}`.trim();
  if (!text || text.length < 12) return "too_thin";
  if (isAggregator(url, title, snippet)) return "aggregator_or_index_page";
  if (GOODS_RE.test(text) && !ADVISORY_RE.test(text)) return "goods_or_works_procurement";
  if (FAR_PLACE_RE.test(text) && !HOME_RE.test(text)) return "outside_our_geography";
  return null;
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  const params = (policy?.params ?? {}) as Record<string, any>;
  const triageMin = Number(body.triage_min ?? params.triage_min ?? 0.30);
  const batchSize = Math.min(Number(body.batch ?? params.triage_batch ?? 200), 200);
  const readBudget = Number(body.read_budget ?? params.read_budget_per_night ?? 120);

  const startedAt = new Date().toISOString();
  const counts: Record<string, any> = {
    scored: 0, passed: 0, rejected: 0, promoted: 0, errors: 0, by_reason: {} as Record<string, number>,
  };
  const scores: number[] = [];
  let costUsd = 0;

  try {
    // The faces we compare against: what consented members have done, want and
    // stand for. Never what they avoid, never what they merely read.
    const { data: consents } = await admin
      .from("oe_consents").select("user_id").eq("kind", "matching").is("revoked_at", null);
    const userIds = [...new Set((consents ?? []).map((c: any) => c.user_id))];
    if (!userIds.length) return json({ ok: true, counts, note: "no consented members" });

    const { data: faces } = await admin
      .from("oe_faces").select("user_id, face, embedding")
      .in("user_id", userIds).in("face", ["done", "wants", "stands"])
      .not("embedding", "is", null);
    const faceVectors = (faces ?? []).map((f: any) => asVector(f.embedding)).filter(Boolean) as number[][];
    if (!faceVectors.length) return json({ ok: true, counts, note: "no face embeddings" });

    const { data: batch } = await admin
      .from("oe_candidates")
      .select("id, url, title, snippet")
      .eq("triage_state", "new")
      .order("first_seen_at", { ascending: true })
      .limit(batchSize);
    const rows = batch ?? [];
    if (!rows.length) return json({ ok: true, counts, note: "nothing new" });

    // 1. Deterministic rules first: no rejected line ever costs us a cent.
    const kept: typeof rows = [];
    for (const c of rows) {
      const reason = deterministicReject(c.title ?? "", c.snippet ?? "", c.url);
      if (reason) {
        counts.rejected++;
        counts.by_reason[reason] = (counts.by_reason[reason] ?? 0) + 1;
        if (!dryRun) {
          await admin.from("oe_candidates")
            .update({ triage_state: "rejected", rejected_reason: reason, triage_score: 0 })
            .eq("id", c.id);
        }
        continue;
      }
      kept.push(c);
    }

    // 2. One embedding call for everything that survived.
    if (kept.length) {
      if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
      const inputs = kept.map((c) => `${c.title ?? ""} ${c.snippet ?? ""}`.trim().slice(0, 2000));
      const { vectors, tokens } = await embedBatch(openaiKey, inputs);
      costUsd += (tokens / 1_000_000) * 0.02;
      await logAIUsage({
        function_name: FN, provider: "openai", model: EMBED_MODEL,
        input_tokens: tokens, metadata: { batch: kept.length },
      });

      const passed: Array<{ id: string; score: number }> = [];
      for (let i = 0; i < kept.length; i++) {
        const c = kept[i];
        const v = vectors[i];
        if (!v) {
          counts.errors++;
          if (!dryRun) await admin.from("oe_candidates").update({ triage_state: "error" }).eq("id", c.id);
          continue;
        }
        let best = 0;
        for (const f of faceVectors) {
          const s = cosine(v, f);
          if (s > best) best = s;
        }
        counts.scored++;
        scores.push(best);
        const text = `${c.title ?? ""} ${c.snippet ?? ""}`;
        const structural = STRUCTURAL_RE.test(text);
        const pass = structural || best >= triageMin;
        if (!dryRun) {
          await admin.from("oe_candidates").update({
            embedding: `[${v.join(",")}]`,
            triage_score: +best.toFixed(4),
            triage_state: pass ? "passed" : "rejected",
            rejected_reason: pass ? null : "below_triage_min",
          }).eq("id", c.id);
        }
        if (pass) { counts.passed++; passed.push({ id: c.id, score: structural ? 1 + best : best }); }
        else {
          counts.rejected++;
          counts.by_reason.below_triage_min = (counts.by_reason.below_triage_min ?? 0) + 1;
        }
      }

      // 3. Promote the best, up to tonight's budget.
      if (!dryRun && passed.length) {
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { count: promotedToday } = await admin.from("job_queue")
          .select("id", { count: "exact", head: true })
          .eq("job_type", "oe_read_candidate").gte("created_at", since);
        const room = Math.max(0, readBudget - (promotedToday ?? 0));
        passed.sort((a, b) => b.score - a.score);
        for (const p of passed.slice(0, room)) {
          const { error } = await admin.from("job_queue").insert({
            job_type: "oe_read_candidate",
            payload: { candidate_id: p.id },
            priority: 5,
          });
          if (!error) counts.promoted++;
        }
      }
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const at = (q: number) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(4) : null;
    const distribution = {
      n: sorted.length, min: at(0), p25: at(0.25), median: at(0.5), p75: at(0.75), max: at(0.999),
    };

    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "triage", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts: { ...counts, distribution, triage_min: triageMin },
      cost_usd: +costUsd.toFixed(6),
    }).select("id").maybeSingle();

    return json({ ok: true, dry_run: dryRun, triage_min: triageMin, counts, distribution, cost_usd: +costUsd.toFixed(6), run_id: run?.id ?? null });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "triage", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts, cost_usd: +costUsd.toFixed(6), error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high" });
    return json({ ok: false, error: msg, counts }, 500);
  }
});
