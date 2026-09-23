/**
 * oe-triage — the cheap filter between the harvest and the reader.
 *
 * Deterministic rules first, because they cost nothing and they are the ones
 * we can explain. Then one batched embedding call, and a score that is simply
 * how close the line comes to what our members have done, want and stand for.
 * Only the highest scores are promoted to the expensive reader, and only up to
 * a budget we set, so cost stays a number we choose rather than one we discover.
 */
import { checkSpendCap } from "../_shared/spendCap.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logEfError } from "../_shared/observe.ts";
import { isAggregator } from "../_shared/oeGuards.ts";
import { parseLevel, levelIndex } from "../_shared/oeEligibility.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-triage";
const EMBED_MODEL = "text-embedding-3-small";

// How much a seat's height counts before anything is read. A title we cannot
// read a level from sits in the middle rather than at the bottom.
const LEVEL_PRIOR: Record<string, number> = {
  board: 1.0, c_suite: 0.95, vp: 0.85, senior_director: 0.8,
  director: 0.7, senior_manager: 0.6, manager: 0.5, ic: 0.4,
};

// Goods and works, not advice. A person does not sit in these.
const GOODS_RE =
  /\b(supply of|purchase of|procurement of (goods|materials|equipment)|printing|vehicles?|furniture|catering|cleaning|maintenance of|construction of|building of|spare parts|stationery|uniforms)\b|توريد|شراء|طباعة|أثاث|مركبات|إعاشة|نظافة|صيانة|إنشاء مبنى/i;
const ADVISORY_RE =
  /\b(consult|advisor|advisory|expert|technical assistance|expression of interest|feasibility|strategy|governance|transformation|study|design of|capacity building)\b|استشار|خبير|دراسة|حوكمة|تحول|استراتيجي/i;

// Structural patterns worth reading whatever the score says.
const STRUCTURAL_RE =
  /\b(board nomination|nomination (for|of) (board|directors)|opening of (the )?nomination|term (is )?ending|end of term|call for speakers|speaker (applications|submissions)|expression of interest|advisory (committee|board|panel)|request for proposal[s]? for (consult|advis)|call for (papers|proposals)|invitation to (nominate|submit)|public consultation|open for (public )?comment|draft (regulation|rules|law|standard) for (public )?consultation)\b|فتح باب الترشح|الترشح لعضوية مجلس|دعوة للمتحدثين|إبداء الاهتمام|اللجنة الاستشارية|استطلاع (عام|مرئيات)|طلب مرئيات/i;

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
  const cap = await checkSpendCap(admin, "oe-triage");
  if (!cap.allowed) {
    return new Response(JSON.stringify({ ok: false, reason: "daily_call_cap", used: cap.used, cap: cap.cap }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;

  const { data: policy } = await admin
    .from("oe_policy_versions").select("params").eq("active", true).maybeSingle();
  const params = (policy?.params ?? {}) as Record<string, any>;
  const batchSize = Math.min(Number(body.batch ?? params.triage_batch ?? 200), 250);
  // ONE READING BUDGET FOR THE DAY. Both the feed step and this one spend from
  // the same number, so the day's reading is a figure we choose.
  const readCap = Number(body.read_cap ?? params.read_cap_per_day ?? 200);
  const readMinLevel = String(params.read_min_level ?? "senior_manager");

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
      .select("id, url, title, snippet, feed_id, entity_id, country")
      .eq("triage_state", "new")
      .order("first_seen_at", { ascending: true })
      .limit(batchSize);
    const rows = batch ?? [];
    if (!rows.length) return json({ ok: true, counts, note: "nothing new" });

    // 1. Deterministic rules first: no rejected line ever costs us a cent.
    //    A seat below the ladder floor is read by nobody, so it is named and
    //    dropped here. A title we cannot read a level from still passes.
    const kept: typeof rows = [];
    for (const c of rows) {
      const lvl = parseLevel(c.title ?? "", null);
      const reason = (lvl && levelIndex(lvl) < levelIndex(readMinLevel))
        ? "junior_title"
        : deterministicReject(c.title ?? "", c.snippet ?? "", c.url);
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

    // The priors that turn one number into a ranking. All of them are data:
    // demand measured from the members, watch tiers and follows from the
    // members' own settings. Nothing about a country is written into this file.
    const feedIds = [...new Set(kept.map((c: any) => c.feed_id).filter(Boolean))];
    const entityIds = [...new Set(kept.map((c: any) => c.entity_id).filter(Boolean))];
    const [{ data: feedRows }, { data: entRows }, { data: demandRows }, { data: eligRows }] = await Promise.all([
      feedIds.length
        ? admin.from("oe_feeds").select("id, country, entity_id").in("id", feedIds)
        : Promise.resolve({ data: [] as any[] }),
      entityIds.length
        ? admin.from("oe_issuers").select("id, country, watch_tier").in("id", entityIds)
        : Promise.resolve({ data: [] as any[] }),
      admin.from("oe_demand_map").select("value, demand").eq("dimension", "country"),
      admin.from("oe_eligibility").select("issuers_followed"),
    ]);
    const feedCountry = new Map((feedRows ?? []).map((f: any) => [f.id, String(f.country ?? "").toUpperCase()]));
    const feedEntity = new Map((feedRows ?? []).map((f: any) => [f.id, f.entity_id]));
    const entCountry = new Map((entRows ?? []).map((e: any) => [e.id, String(e.country ?? "").toUpperCase()]));
    const coreEntities = new Set(
      (entRows ?? []).filter((e: any) => String(e.watch_tier ?? "") === "core").map((e: any) => e.id),
    );
    const followed = new Set<string>();
    for (const r of eligRows ?? []) for (const i of ((r as any).issuers_followed ?? [])) followed.add(String(i));

    const demandRaw = new Map(
      (demandRows ?? []).map((d: any) => [String(d.value).toUpperCase(), Number(d.demand) || 0]),
    );
    const demandMax = Math.max(0, ...demandRaw.values());
    const regionPrior = (country: string): number => {
      if (!country) return 0.5;
      const d = demandRaw.get(country);
      // A known country no member asked for is read last, never dropped.
      if (!demandMax) return 0.5;
      if (d === undefined) return 0;
      return Math.max(0, Math.min(1, d / demandMax));
    };

    // The last seven days of scores are the yardstick: how close this line is
    // compared with everything we have seen lately, not against a fixed number.
    const { data: recentScores } = await admin
      .from("oe_candidates")
      .select("triage_score")
      .gte("updated_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .not("triage_score", "is", null)
      .limit(5000);
    const history = (recentScores ?? [])
      .map((r: any) => Number(r.triage_score)).filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

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

      const passed: Array<{ id: string; title: string; priority: number }> = [];
      const batchScores: number[] = [];
      for (let i = 0; i < kept.length; i++) {
        const v = vectors[i];
        if (v) {
          let best = 0;
          for (const f of faceVectors) {
            const s = cosine(v, f);
            if (s > best) best = s;
          }
          batchScores.push(best);
        }
      }
      const ladder = [...history, ...batchScores].sort((a, b) => a - b);
      const percentile = (s: number): number => {
        if (!ladder.length) return 0.5;
        let lo = 0, hi = ladder.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (ladder[m] < s) lo = m + 1; else hi = m; }
        return lo / ladder.length;
      };

      for (let i = 0; i < kept.length; i++) {
        const c: any = kept[i];
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

        const lvl = parseLevel(c.title ?? "", null);
        const levelP = lvl ? (LEVEL_PRIOR[lvl] ?? 0.5) : 0.5;
        const entityId = c.entity_id ?? feedEntity.get(c.feed_id) ?? null;
        // The posting's own country first; an employer's home country says nothing
        // about where a worldwide tenant's job sits.
        const country = String(c.country ?? "").toUpperCase() || (entityId && entCountry.get(entityId)) || feedCountry.get(c.feed_id) || "";
        const regionP = regionPrior(country);
        const issuerP = entityId && (followed.has(String(entityId)) || coreEntities.has(entityId)) ? 1 : 0.5;

        const text = `${c.title ?? ""} ${c.snippet ?? ""}`;
        const structural = STRUCTURAL_RE.test(text);
        let priority = 0.5 * percentile(best) + 0.2 * levelP + 0.2 * regionP + 0.1 * issuerP;
        if (structural) priority += 1;
        priority = +priority.toFixed(4);

        if (!dryRun) {
          await admin.from("oe_candidates").update({
            embedding: `[${v.join(",")}]`,
            triage_score: +best.toFixed(4),
            priority,
            triage_state: "passed",
            rejected_reason: null,
          }).eq("id", c.id);
        }
        counts.passed++;
        passed.push({ id: c.id, title: String(c.title ?? ""), priority });
      }

      // 3. Promote the highest priority, up to the one daily reading budget.
      passed.sort((a, b) => b.priority - a.priority);
      counts.top_promoted = passed.slice(0, 10).map((p) => ({ title: p.title.slice(0, 90), priority: p.priority }));
      if (!dryRun && passed.length) {
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { count: promotedToday } = await admin.from("job_queue")
          .select("id", { count: "exact", head: true })
          .eq("job_type", "oe_read_candidate").gte("created_at", since);
        counts.read_today_before = promotedToday ?? 0;
        const room = Math.max(0, readCap - (promotedToday ?? 0));
        for (const p of passed.slice(0, room)) {
          const { error } = await admin.from("job_queue").insert({
            job_type: "oe_read_candidate",
            payload: { candidate_id: p.id },
            priority: 5,
          });
          if (!error) counts.promoted++;
        }
        counts.top_promoted = passed.slice(0, Math.min(10, room)).map((p) => ({
          title: p.title.slice(0, 90), priority: p.priority,
        }));
      }
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const at = (q: number) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(4) : null;
    const distribution = {
      n: sorted.length, min: at(0), p25: at(0.25), median: at(0.5), p75: at(0.75), max: at(0.999),
    };

    const { data: run } = await admin.from("oe_runs").insert({
      run_kind: "triage", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts: { ...counts, distribution, read_cap: readCap },
      cost_usd: +costUsd.toFixed(6),
    }).select("id").maybeSingle();

    return json({ ok: true, dry_run: dryRun, read_cap: readCap, counts, distribution, cost_usd: +costUsd.toFixed(6), run_id: run?.id ?? null });
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
