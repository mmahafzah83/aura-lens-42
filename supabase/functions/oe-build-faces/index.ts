/**
 * oe-build-faces — reads what the system already holds about one member and writes five faces into oe_faces: done (what he has done), wants (what he wants), reads (what he reads), stands (where he stands), avoid (what is not his). Each face carries a pseudonymised summary, keywords, and concrete search queries in Arabic and English. The member never writes a query. Nothing personal (name, employer, email) may appear in any summary or query.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PUBLISHED_SOURCE_TYPES,
  PUBLISHED_TRACKING_STATUSES,
  isPublishedPost,
} from "../_shared/postProvenance.ts";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-build-faces";
const PROMPT_VERSION = "p1-1.1";
const MODEL = "google/gemini-3-flash-preview";
const EMBED_MODEL = "text-embedding-3-small";
const FACES = ["done", "wants", "reads", "stands", "avoid"] as const;
type Face = typeof FACES[number];

const DEFAULT_WEIGHTS: Record<Face, number> = {
  done: 0.2,
  wants: 0.3,
  reads: 0.2,
  stands: 0.2,
  avoid: -1,
};

const P1_SYSTEM = `You build five faces of one senior professional for an opportunity-matching engine. You receive pseudonymised facts only. Return strict JSON: {done:{summary,keywords,queries}, wants:{summary,keywords,queries}, reads:{summary,keywords,queries}, stands:{summary,keywords,queries}, avoid:{summary,keywords}}. Rules: summary ≤ 90 words, plain language, third person, no names, no employers, no email, no city unless it is in the facts. keywords: 8–15 short terms in the language of the facts (Arabic terms stay Arabic, English stay English). queries: 6–10 concrete search questions a researcher would type to find opportunities for this person — board seats, advisory mandates and tenders, senior roles, executive rooms and dinners, speaking slots, media requests, awards, trainings — half in Arabic and half in English, each ≤ 14 words, specific to sector, level and place (e.g. 'عضو مجلس إدارة مستقل بنك مدرج خبرة تحول رقمي', 'independent director listed utility Saudi digital transformation'). queries for the reads face find rooms, panels, calls for speakers, advisory groups, trainings and awards about these topics — not reading material. avoid lists only what the facts say the person rejects or is not; never guess. Do not use these words: ${OE_BANNED_FOR_PROMPT}.`; You receive pseudonymised facts only. Return strict JSON: {done:{summary,keywords,queries}, wants:{summary,keywords,queries}, reads:{summary,keywords,queries}, stands:{summary,keywords,queries}, avoid:{summary,keywords}}. Rules: summary ≤ 90 words, plain language, third person, no names, no employers, no email, no city unless it is in the facts. keywords: 8–15 short terms in the language of the facts (Arabic terms stay Arabic, English stay English). queries: 6–10 concrete search questions a researcher would type to find opportunities for this person — board seats, advisory mandates and tenders, senior roles, executive rooms and dinners, speaking slots, media requests, awards, trainings — half in Arabic and half in English, each ≤ 14 words, specific to sector, level and place (e.g. 'عضو مجلس إدارة مستقل بنك مدرج خبرة تحول رقمي', 'independent director listed utility Saudi digital transformation'). avoid lists only what the facts say the person rejects or is not; never guess. Do not use these words: authority (as a noun), thought leader, personal brand, trajectory, leverage (as a verb).`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Unwrap a top-level array the model sometimes wraps the object in. */
function normaliseJson(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) parsed = JSON.parse(t.slice(s, e + 1));
    else throw new Error("unparseable model output");
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== "object") throw new Error("model output is not an object");
  return parsed;
}

/**
 * Employers never travel to the model. A company name is replaced by a generic
 * descriptor, or dropped when the heuristic is unsure.
 */
function genericEmployer(name?: string | null): string | null {
  const n = (name || "").toLowerCase();
  if (!n) return null;
  if (/\b(pwc|kpmg|deloitte|ey|ernst|mckinsey|bcg|bain|accenture|consult)/.test(n)) {
    return "a professional services firm";
  }
  if (/bank|capital|financial|finance|invest|مصرف|بنك/.test(n)) return "a bank";
  if (/ministry|authority|government|municipal|وزارة|هيئة|أمانة/.test(n)) return "a government body";
  if (/university|college|school|جامعة|كلية/.test(n)) return "a university";
  if (/hospital|health|clinic|صحة|مستشفى/.test(n)) return "a healthcare provider";
  if (/telecom|stc|mobile|اتصالات/.test(n)) return "a telecom operator";
  if (/energy|oil|petro|aramco|utility|power|water|طاقة|كهرباء|مياه/.test(n)) {
    return "an energy or utility company";
  }
  if (/holding|group|company|llc|ltd|plc|شركة|مجموعة/.test(n)) return "a listed or private company";
  return null;
}

const daysSince = (iso?: string | null) =>
  iso ? Math.max(0, (Date.now() - Date.parse(iso)) / 86_400_000) : 999;

const clip = (s: unknown, n: number) =>
  typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null;

const strArr = (v: unknown, n = 15): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, n) : [];

async function embed(key: string, inputs: string[]): Promise<number[][] | null> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!r.ok) {
    console.error(`[${FN}] embed failed`, r.status, (await r.text()).slice(0, 300));
    return null;
  }
  const j = await r.json();
  return (j?.data || []).map((d: any) => d.embedding as number[]);
}

async function callModel(apiKey: string, userMessage: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: P1_SYSTEM },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`gateway ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return { content, usage: data?.usage || {} };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const cronSecret = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const apiKeyHeader = req.headers.get("apikey") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!cronSecret && (req.headers.get("x-cron-secret") || "") === cronSecret;

    let body: any = {};
    try {
      body = await req.json();
    } catch (_) { /* no body */ }

    let user_id: string | null = null;
    if (isServiceRole || isCron) {
      if (body?.all_users === true) {
        const { data: consents, error: cErr } = await admin
          .from("oe_consents")
          .select("user_id")
          .eq("kind", "matching")
          .is("revoked_at", null);
        if (cErr) return json({ error: cErr.message }, 500);
        const candidates = Array.from(
          new Set(((consents as any[]) || []).map((c) => c.user_id).filter(Boolean)),
        );
        let ids: string[] = [];
        if (candidates.length) {
          const { data: profs, error: pErr } = await admin
            .from("diagnostic_profiles")
            .select("user_id, account_type, excluded_at")
            .in("user_id", candidates)
            .in("account_type", ["customer", "staff"])
            .is("excluded_at", null);
          if (pErr) return json({ error: pErr.message }, 500);
          ids = Array.from(new Set(((profs as any[]) || []).map((p) => p.user_id)));
        }
        const failures: string[] = [];
        let users_processed = 0;
        for (const uid of ids) {
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/${FN}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
              },
              body: JSON.stringify({ user_id: uid, dry_run: body?.dry_run === true }),
            });
            if (!r.ok) {
              console.error(`[${FN}] user ${uid} failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
              failures.push(uid);
            } else users_processed++;
          } catch (e) {
            console.error(`[${FN}] user ${uid} threw:`, (e as Error).message);
            failures.push(uid);
          }
        }
        return json({ ok: true, users_processed, failures });
      }
      if (typeof body?.user_id === "string") user_id = body.user_id;
    } else {
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: u, error: uErr } = await userClient.auth.getUser(bearer);
      if (uErr || !u?.user) return json({ error: "Unauthorized" }, 401);
      user_id = u.user.id; // the caller's own id wins over anything in the body
    }

    if (!user_id) return json({ error: "user_id required" }, 400);
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);
    if (!openaiKey) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const dryRun = body?.dry_run === true;
    const startedAt = new Date().toISOString();
    const sinceEntries = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const sincePosts = new Date(Date.now() - 180 * 86_400_000).toISOString();

    // ---------- READ ----------
    const [
      profRes, capRes, snapRes, entriesRes, fragRes,
      postsRes, itemsRes, signalsRes, prefsRes, corrRes, findingsRes, facesRes, policyRes,
    ] = await Promise.all([
      admin.from("diagnostic_profiles").select(
        "level, core_practice, sector_focus, seniority_band, years_experience, primary_strength, brand_pillars, identity_intelligence, audit_results, north_star_goal, brand_assessment_results, desk_prefs",
      ).eq("user_id", user_id).maybeSingle(),
      admin.from("capability_responses")
        .select("level, instrument_version, capability_dimensions(name)")
        .eq("user_id", user_id).order("created_at", { ascending: false }).limit(60),
      admin.from("linkedin_profile_snapshots")
        .select("headline, experience, skills, certifications, created_at")
        .eq("user_id", user_id).order("created_at", { ascending: false }).limit(1),
      admin.from("entries")
        .select("id, type, title, summary, skill_pillar, framework_tag, created_at")
        .eq("user_id", user_id).gte("created_at", sinceEntries)
        .order("created_at", { ascending: false }).limit(120),
      admin.from("evidence_fragments")
        .select("id, title, fragment_type, skill_pillars, tags")
        .eq("user_id", user_id).order("created_at", { ascending: false }).limit(40),
      admin.from("linkedin_posts")
        .select("id, source_type, tracking_status, post_text, hook, created_at")
        .eq("user_id", user_id)
        .in("source_type", PUBLISHED_SOURCE_TYPES)
        .in("tracking_status", PUBLISHED_TRACKING_STATUSES)
        .gte("created_at", sincePosts)
        .order("created_at", { ascending: false }).limit(80),
      admin.from("content_items").select("id, title, body")
        .eq("user_id", user_id).eq("status", "published")
        .order("created_at", { ascending: false }).limit(20),
      admin.from("strategic_signals")
        .select("id, signal_title, theme_tags, what_it_means_for_you")
        .eq("user_id", user_id).eq("status", "active")
        .order("created_at", { ascending: false }).limit(10),
      admin.from("signal_topic_preferences").select("theme_tag, preference_score").eq("user_id", user_id),
      admin.from("oe_corrections")
        .select("id, reach, reach_value, chair_type, sector, seniority_band")
        .eq("user_id", user_id).gt("expires_at", new Date().toISOString()).limit(50),
      admin.from("agent_findings").select("dropped_themes, created_at")
        .eq("user_id", user_id).eq("status", "dismissed")
        .order("created_at", { ascending: false }).limit(2),
      admin.from("oe_faces").select("face, weight").eq("user_id", user_id),
      admin.from("oe_policy_versions").select("params").eq("active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const p: any = profRes.data || {};
    const ii: any = (p.identity_intelligence && typeof p.identity_intelligence === "object") ? p.identity_intelligence : {};
    const ba: any = (p.brand_assessment_results && typeof p.brand_assessment_results === "object") ? p.brand_assessment_results : {};
    const snap: any = ((snapRes.data as any[]) || [])[0] || {};

    // Employers are mapped to generic descriptors; titles and years only.
    const experience = (Array.isArray(snap.experience) ? snap.experience : []).slice(0, 12).map((e: any) => ({
      title: clip(e?.title || e?.position, 120),
      kind: genericEmployer(e?.company || e?.companyName || e?.organisation),
      industry: clip(e?.industry, 80),
      years: clip(e?.duration || e?.dateRange || e?.years, 40),
    })).filter((e: any) => e.title);

    const entriesAll = ((entriesRes.data as any[]) || []);
    const entriesRanked = entriesAll
      .map((e) => ({ e, w: Math.exp(-daysSince(e.created_at) / 30) + (e.summary ? 0.25 : 0) }))
      .sort((a, b) => b.w - a.w).slice(0, 80).map((x) => x.e);

    const posts = ((postsRes.data as any[]) || []).filter(isPublishedPost).slice(0, 40);
    const items = ((itemsRes.data as any[]) || []);
    const signals = ((signalsRes.data as any[]) || []);
    const frags = ((fragRes.data as any[]) || []);
    const prefs = ((prefsRes.data as any[]) || []);
    const corrections = ((corrRes.data as any[]) || []);
    const droppedThemes = ((findingsRes.data as any[]) || [])
      .flatMap((f) => (Array.isArray(f.dropped_themes) ? f.dropped_themes : []))
      .filter((t) => typeof t === "string").slice(0, 20);

    const policyWeights = ((policyRes.data as any)?.params?.face_weights_default) || DEFAULT_WEIGHTS;
    const existingWeights: Record<string, number> = {};
    for (const row of ((facesRes.data as any[]) || [])) existingWeights[row.face] = Number(row.weight);
    const weightFor = (f: Face) =>
      existingWeights[f] !== undefined && Number.isFinite(existingWeights[f])
        ? existingWeights[f]
        : Number(policyWeights?.[f] ?? DEFAULT_WEIGHTS[f]);

    // ---------- PSEUDONYMISED FACTS (no name, employer, email, handle, avatar) ----------
    const facts = {
      done: {
        level: p.level ?? null,
        core_practice: p.core_practice ?? null,
        sector_focus: p.sector_focus ?? null,
        seniority_band: p.seniority_band ?? null,
        years_experience: p.years_experience ?? null,
        primary_strength: p.primary_strength ?? null,
        brand_pillars: p.brand_pillars ?? null,
        expertise_areas: ii.expertise_areas ?? null,
        knowledge_domains: ii.knowledge_domains ?? null,
        capabilities: ii.capabilities ?? null,
        industries: ii.industries ?? null,
        primary_role: ii.primary_role ?? null,
        secondary_strengths: ii.secondary_strengths ?? null,
        values: ii.values ?? null,
        audit_results: p.audit_results ?? null,
        capability_levels: ((capRes.data as any[]) || []).slice(0, 24).map((r) => ({
          dimension: r?.capability_dimensions?.name ?? null,
          level: r?.level ?? null,
        })).filter((r) => r.dimension),
        headline: clip(snap.headline, 200),
        experience,
        skills: strArr(snap.skills, 25),
        certifications: strArr(snap.certifications, 15),
      },
      wants: {
        goals: typeof p.north_star_goal === "string" ? p.north_star_goal.split("|").map((s: string) => s.trim()).filter(Boolean) : [],
        positioning_statement: clip(ba.positioning_statement, 400),
        uncontested_space: ba.uncontested_space ?? null,
        content_pillars: ba.content_pillars ?? null,
        invest_next: ba.invest_next ?? null,
        growth_areas: ba.growth_areas ?? null,
        topics: ba.topics ?? null,
        unique_capability: ba.unique_capability ?? null,
        watch_hints: (p.desk_prefs && typeof p.desk_prefs === "object") ? (p.desk_prefs as any).watch ?? null : null,
      },
      reads: {
        recent_entries: entriesRanked.map((e) => ({
          type: e.type, title: clip(e.title, 140), summary: clip(e.summary, 300),
          pillar: e.skill_pillar, framework: e.framework_tag,
        })),
        evidence: frags.map((f) => ({
          title: clip(f.title, 140), kind: f.fragment_type,
          pillars: f.skill_pillars ?? null, tags: f.tags ?? null,
        })),
      },
      stands: {
        published_posts: posts.map((x) => ({
          hook: clip(x.hook, 200), text: clip(x.post_text, 300),
        })),
        published_items: items.map((x) => ({ title: clip(x.title, 140), text: clip(x.body, 200) })),
        active_signals: signals.map((s) => ({
          title: clip(s.signal_title, 160), themes: s.theme_tags ?? null,
          means: clip(s.what_it_means_for_you, 300),
        })),
        topic_preferences: prefs.map((t) => ({ theme: t.theme_tag, score: t.preference_score })),
      },
      avoid: {
        rejected_themes: prefs.filter((t) => Number(t.preference_score) < 0).map((t) => t.theme_tag),
        corrections: corrections.map((c) => ({
          reach: c.reach, reach_value: c.reach_value, chair_type: c.chair_type,
          sector: c.sector, seniority_band: c.seniority_band,
        })),
        dropped_themes: droppedThemes,
      },
    };

    const userMessage = JSON.stringify(facts);

    // ---------- MODEL ----------
    const valid = (o: any) =>
      o && FACES.every((f) => o[f] && typeof o[f].summary === "string" && o[f].summary.trim());

    let parsed: any = null;
    let usage: any = {};
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const out = await callModel(lovableKey, userMessage);
        usage = out.usage;
        const candidate = normaliseJson(out.content);
        if (!valid(candidate)) throw new Error("a face is missing from the model output");
        parsed = candidate;
      } catch (e) {
        lastErr = (e as Error).message;
        console.error(`[${FN}] model attempt ${attempt + 1} failed:`, lastErr);
      }
    }

    await logAIUsage({
      user_id, function_name: FN, provider: "lovable", model: MODEL,
      input_tokens: usage?.prompt_tokens ?? 0, output_tokens: usage?.completion_tokens ?? 0,
      success: !!parsed, error_code: parsed ? null : "model_invalid_json",
    });

    if (!parsed) {
      await logEfError(admin, {
        function_name: FN, error: lastErr, severity: "high",
        user_id, context: { user_id, error: lastErr },
      });
      await admin.from("oe_runs").insert({
        run_kind: "build_faces", user_id, started_at: startedAt,
        finished_at: new Date().toISOString(), outcome: "error",
        error: lastErr.slice(0, 500),
      });
      return json({ error: "faces_unbuildable", detail: lastErr }, 502);
    }

    const built: Record<Face, { summary: string; keywords: string[]; queries: string[]; weight: number }> =
      {} as any;
    let queriesTotal = 0;
    for (const f of FACES) {
      const src = parsed[f] || {};
      const queries = f === "avoid" ? [] : strArr(src.queries, 10);
      queriesTotal += queries.length;
      built[f] = {
        summary: String(src.summary || "").trim(),
        keywords: strArr(src.keywords, 15),
        queries,
        weight: weightFor(f),
      };
    }

    const counts = {
      entries: entriesRanked.length,
      posts: posts.length,
      signals: signals.length,
      fragments: frags.length,
      corrections: corrections.length,
      queries_total: queriesTotal,
    };

    if (dryRun) {
      const { data: runRow } = await admin.from("oe_runs").insert({
        run_kind: "build_faces", user_id, started_at: startedAt,
        finished_at: new Date().toISOString(), outcome: "dry_run", counts,
      }).select("id").maybeSingle();
      return json({ ok: true, user_id, faces: built, counts, run_id: (runRow as any)?.id ?? null });
    }

    // ---------- EMBEDDINGS ----------
    const vectors = await embed(
      openaiKey,
      FACES.map((f) => `${built[f].summary} ${built[f].keywords.join(" ")}`.trim().slice(0, 8000)),
    );
    await logAIUsage({
      user_id, function_name: FN, provider: "openai", model: EMBED_MODEL,
      input_tokens: 0, output_tokens: 0, success: !!vectors,
      error_code: vectors ? null : "embedding_failed",
    });

    // ---------- WRITE ----------
    const inputsBase = {
      profile_fields: [
        "level", "core_practice", "sector_focus", "seniority_band", "years_experience",
        "primary_strength", "brand_pillars", "identity_intelligence", "audit_results",
        "north_star_goal", "brand_assessment_results", "desk_prefs",
        "capability_responses", "linkedin_profile_snapshots",
      ],
      entry_ids: entriesRanked.map((e) => e.id),
      post_ids: posts.map((x) => x.id),
      signal_ids: signals.map((s) => s.id),
      fragment_ids: frags.map((f) => f.id),
      correction_ids: corrections.map((c) => c.id),
      prompt_version: PROMPT_VERSION,
      model: MODEL,
    };

    const nowIso = new Date().toISOString();
    const rows = FACES.map((f, i) => ({
      user_id,
      face: f,
      summary: built[f].summary,
      keywords: built[f].keywords,
      queries: built[f].queries,
      weight: built[f].weight,
      embedding: vectors?.[i] ? `[${vectors[i].join(",")}]` : null,
      inputs: inputsBase,
      built_at: nowIso,
      updated_at: nowIso,
    }));

    const { error: upErr } = await admin
      .from("oe_faces")
      .upsert(rows, { onConflict: "user_id,face" });

    const { data: runRow } = await admin.from("oe_runs").insert({
      run_kind: "build_faces", user_id, started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: upErr ? "error" : "ok",
      counts,
      cost_usd: Number(
        (((usage?.prompt_tokens ?? 0) * 0.075 + (usage?.completion_tokens ?? 0) * 0.3) / 1_000_000
          + 0.00002).toFixed(6),
      ),
      error: upErr ? upErr.message.slice(0, 500) : null,
    }).select("id").maybeSingle();

    if (upErr) {
      await logEfError(admin, {
        function_name: FN, error: upErr.message, severity: "high",
        user_id, context: { user_id, error: upErr.message },
      });
      return json({ error: upErr.message }, 500);
    }

    await logEfError(admin, {
      function_name: FN,
      error: `OE_FACES_OK user=${user_id} queries=${queriesTotal}`,
      severity: "info",
      user_id,
      context: counts,
    });

    return json({ ok: true, user_id, faces: built, counts, run_id: (runRow as any)?.id ?? null });
  } catch (err) {
    console.error(`[${FN}] unhandled:`, err);
    try {
      await logEfError(admin, { function_name: FN, error: err, severity: "high" });
    } catch (_) { /* never mask */ }
    return json({ error: (err as Error)?.message || "error" }, 500);
  }
});
