import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 30;       // days of no new evidence until "stale"
const FRESH_THRESHOLD = 0.5;     // momentum at/above this = fresh
const STRENGTH_FLOOR  = 0.45;    // normal visibility threshold on strength_score
const TOP_N_GUARANTEE = 6;       // cold-start: always show a user's top 6
const MAX_VISIBLE     = 20;      // power-user cap: never surface more than this as strong

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace("Bearer ", "");
  const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isCron = !!cronSecret && cronHeader === cronSecret;

  // Allow service-role callers (cron/lifecycle) OR authenticated users.
  let authedUserId: string | null = null;
  const isServiceRole = bearer === serviceKey || apiKeyHeader === serviceKey;
  if (!isServiceRole && !isCron) {
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(bearer);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    authedUserId = user.id;
  }
  try {
    const body = await req.json().catch(() => ({}));
    const requested = (body as any)?.user_id;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Cron / service-role with no specific user → iterate every user that has active signals.
    let userIds: string[];
    if (isCron && !requested) {
      const { data: rows } = await admin
        .from("strategic_signals")
        .select("user_id")
        .in("status", ["active", "dormant"]);
      userIds = Array.from(new Set((rows || []).map((r: any) => r.user_id).filter(Boolean)));
    } else {
      const single = (isServiceRole || isCron) ? requested : authedUserId;
      if (!single) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userIds = [single];
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let totalProcessed = 0;
    const totalCounts = { fading: 0, dormant: 0, accelerating: 0, stable: 0 };

    for (const user_id of userIds) {
    const { data: signals, error } = await admin
      .from("strategic_signals")
      .select("id, confidence, base_confidence, strength_score, fragment_count, supporting_evidence_ids, last_decay_at, last_evidence_at, status, velocity_status")
      .eq("user_id", user_id)
      .in("status", ["active", "dormant"]);

    if (error) throw new Error(error.message);

    let processed = 0;
    const counts = { fading: 0, dormant: 0, accelerating: 0, stable: 0 };

    // Rank by strength so visibility guarantees a healthy set even for light users
    const ranked = [...(signals || [])].sort(
      (a: any, b: any) => (Number(b.strength_score) || 0) - (Number(a.strength_score) || 0)
    );
    const rankById = new Map<string, number>();
    ranked.forEach((s: any, i: number) => rankById.set(s.id, i + 1));

    for (const s of signals || []) {
      // Guard: skip if last_decay_at < 6h ago
      if (s.last_decay_at && now - new Date(s.last_decay_at).getTime() < SIX_HOURS_MS) {
        continue;
      }

      // Find newest supporting fragment date
      let newestDate: Date | null = null;
      const evidenceIds: string[] = s.supporting_evidence_ids || [];
      if (evidenceIds.length > 0) {
        const { data: frags } = await admin.from("evidence_fragments")
          .select("created_at").in("id", evidenceIds)
          .order("created_at", { ascending: false }).limit(1);
        if (frags && frags.length > 0) newestDate = new Date(frags[0].created_at);
      }

      // Momentum: ABSOLUTE function of age (NOT compounding). null if no evidence date.
      let momentum: number | null = null;
      if (newestDate) {
        const daysSince = Math.max(0, (now - newestDate.getTime()) / 86400000);
        momentum = Math.exp((-Math.LN2 / HALF_LIFE_DAYS) * daysSince); // 0..1
      }

      const strength = Number(s.strength_score) || 0;
      const rank = rankById.get(s.id) || 9999;
      const isFresh = momentum !== null && momentum >= FRESH_THRESHOLD;
      const visibleStrong =
        (strength >= STRENGTH_FLOOR || rank <= TOP_N_GUARANTEE) && rank <= MAX_VISIBLE;

      let lifecycle_tier: "live" | "evergreen" | "emerging" | "faded";
      if (visibleStrong) lifecycle_tier = isFresh ? "live" : "evergreen";
      else if (isFresh)  lifecycle_tier = "emerging";
      else               lifecycle_tier = "faded";

      const newStatus = lifecycle_tier === "faded" ? "dormant" : "active";
      const velocityMap: Record<string, "accelerating" | "stable" | "dormant"> = {
        live: "accelerating", evergreen: "stable", emerging: "stable", faded: "dormant",
      };
      const velocity_status = velocityMap[lifecycle_tier];

      const { error: upErr } = await admin.from("strategic_signals").update({
        confidence: strength,
        momentum: momentum,
        lifecycle_tier: lifecycle_tier,
        velocity_status: velocity_status,
        last_evidence_at: newestDate ? newestDate.toISOString() : s.last_evidence_at,
        last_decay_at: nowIso,
        status: newStatus,
      }).eq("id", s.id);

      if (!upErr) {
        processed++;
        if (velocity_status in counts) (counts as any)[velocity_status]++;
      }
    }

      console.log(`[signal-decay-engine] user=${user_id} processed=${processed}`, counts);
      totalProcessed += processed;
      totalCounts.fading += counts.fading;
      totalCounts.dormant += counts.dormant;
      totalCounts.accelerating += counts.accelerating;
      totalCounts.stable += counts.stable;
    }

    return new Response(JSON.stringify({
      users: userIds.length,
      processed: totalProcessed,
      ...totalCounts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[signal-decay-engine] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});