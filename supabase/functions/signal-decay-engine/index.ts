import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.05;

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
        .eq("status", "active");
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
      .select("id, confidence, supporting_evidence_ids, last_decay_at, status, velocity_status")
      .eq("user_id", user_id)
      .eq("status", "active");

    if (error) throw new Error(error.message);

    let processed = 0;
    const counts = { fading: 0, dormant: 0, accelerating: 0, stable: 0 };

    for (const s of signals || []) {
      // Guard: skip if last_decay_at < 6h ago
      if (s.last_decay_at && now - new Date(s.last_decay_at).getTime() < SIX_HOURS_MS) {
        continue;
      }

      const evidenceIds: string[] = s.supporting_evidence_ids || [];
      let newestDate: Date | null = null;
      let recentCount14d = 0;

      if (evidenceIds.length > 0) {
        const { data: frags } = await admin
          .from("evidence_fragments")
          .select("created_at")
          .in("id", evidenceIds)
          .order("created_at", { ascending: false });
        if (frags && frags.length > 0) {
          newestDate = new Date(frags[0].created_at);
          const cutoff14 = now - 14 * 86400000;
          recentCount14d = frags.filter((f: any) => new Date(f.created_at).getTime() >= cutoff14).length;
        }
      }

      const currentConf = Number(s.confidence) || 0;
      let newConf = currentConf;
      let velocity = 0;
      let velocityStatus: "accelerating" | "stable" | "fading" | "dormant" = "stable";
      let newStatus = s.status;

      if (!newestDate) {
        // No fragments at all
        newConf = 0.10;
        velocity = newConf - currentConf;
        velocityStatus = "dormant";
        newStatus = "dormant";
      } else {
        const daysSince = Math.max(0, (now - newestDate.getTime()) / 86400000);
        if (daysSince < 7) {
          newConf = currentConf;
          velocity = 0;
          velocityStatus = recentCount14d >= 2 ? "accelerating" : "stable";
        } else {
          const decayFactor = Math.exp(-0.023 * daysSince);
          newConf = Math.max(MIN_CONFIDENCE, currentConf * decayFactor);
          velocity = newConf - currentConf;
          if (velocity > 0.05) velocityStatus = "accelerating";
          else if (velocity > -0.05) velocityStatus = "stable";
          else if (newConf >= 0.30) velocityStatus = "fading";
          else velocityStatus = "dormant";
        }

        if (newConf < 0.15) newStatus = "dormant";
        // Otherwise keep current status (fading is reflected via velocity_status)
      }

      newConf = Math.max(MIN_CONFIDENCE, Math.min(1, newConf));

      const { error: upErr } = await admin.from("strategic_signals").update({
        confidence: newConf,
        signal_velocity: velocity,
        velocity_status: velocityStatus,
        last_decay_at: nowIso,
        status: newStatus,
      }).eq("id", s.id);

      if (!upErr) {
        processed++;
        counts[velocityStatus]++;
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