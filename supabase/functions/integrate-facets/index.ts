import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PUBLISHED_SOURCE_TYPES,
  PUBLISHED_TRACKING_STATUSES,
  isPublishedPost,
} from "../_shared/postProvenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Facet =
  | "identity"
  | "edge"
  | "voice"
  | "focus"
  | "audience"
  | "discernment"
  | "conviction";

type FacetResult = {
  value: number;
  uncertainty: number;
  inputs: Record<string, unknown>;
  last_reinforced_at: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clamp01 = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const daysBetween = (a: Date, b: Date) =>
  Math.max(0, (a.getTime() - b.getTime()) / 86_400_000);

const recencyWeight = (days: number) => Math.exp(-days / 45);

const maxTs = (...vals: Array<string | null | undefined>): string | null => {
  let best: number | null = null;
  let bestStr: string | null = null;
  for (const v of vals) {
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestStr = v;
    }
  }
  return bestStr;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const apiKeyHeader =
      req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isServiceRole =
      !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      /* no body */
    }

    let user_id: string | null = null;
    if (isServiceRole || isCron) {
      if (body && typeof body.user_id === "string") user_id = body.user_id;
    } else {
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const {
        data: { user },
        error: userErr,
      } = await userClient.auth.getUser(bearer);
      if (userErr || !user) return json({ error: "Unauthorized" }, 401);
      user_id = user.id;
    }

    if (!user_id) return json({ error: "user_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const now = new Date();

    // -------- Parallel fetch all inputs --------
    const [
      diagRes,
      eventsRes,
      fragCountRes,
      voiceRes,
      signalsRes,
      audienceRes,
      snapshotsRes,
      postsRes,
      critiqueRes,
    ] = await Promise.all([
      admin
        .from("diagnostic_profiles")
        .select("id, brand_assessment_completed_at, identity_intelligence")
        .eq("user_id", user_id)
        .maybeSingle(),
      admin
        .from("source_events")
        .select("id, event_type, occurred_at, processed_at")
        .eq("user_id", user_id),
      admin
        .from("evidence_fragments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id),
      admin
        .from("authority_voice_profiles")
        .select("id, tone, example_posts, is_primary, updated_at")
        .eq("user_id", user_id),
      admin
        .from("strategic_signals")
        .select("id, status, lifecycle_tier, strength_score, updated_at")
        .eq("user_id", user_id)
        .eq("status", "active")
        .not("lifecycle_tier", "is", null),
      admin
        .from("audience_demographics")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id),
      admin
        .from("influence_snapshots")
        .select("snapshot_date, followers, follower_growth")
        .eq("user_id", user_id)
        .order("snapshot_date", { ascending: false })
        .limit(2),
      admin
        .from("linkedin_posts")
        .select(
          "id, source_type, tracking_status, source_signal_id, published_at, created_at",
        )
        .eq("user_id", user_id)
        .in("source_type", PUBLISHED_SOURCE_TYPES)
        .in("tracking_status", PUBLISHED_TRACKING_STATUSES),
      admin
        .from("notifications")
        .select("id, created_at")
        .eq("user_id", user_id)
        .ilike("type", "%critique%")
        .limit(1),
    ]);

    const diag = (diagRes.data as any) || null;
    const events = (eventsRes.data as any[]) || [];
    const fragmentCount = fragCountRes.count ?? 0;
    const voiceProfiles = (voiceRes.data as any[]) || [];
    const activeSignals = (signalsRes.data as any[]) || [];
    const demographicsCount = audienceRes.count ?? 0;
    const snapshots = (snapshotsRes.data as any[]) || [];
    const allPublishedPosts = (postsRes.data as any[]) || [];
    const publishedPosts = allPublishedPosts.filter((p) => isPublishedPost(p));
    const hasCritique = ((critiqueRes.data as any[]) || []).length > 0;

    // -------- 1. identity --------
    const identityFn = (): FacetResult => {
      const assessment = diag?.brand_assessment_completed_at ? 1 : 0;
      const ii = (diag?.identity_intelligence as Record<string, unknown>) || {};
      let filled = 0;
      for (const v of Object.values(ii)) {
        if (v === null || v === undefined) continue;
        if (typeof v === "string" && v.trim() === "") continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v as any).length === 0) continue;
        filled++;
      }
      const filledRatio = Math.min(1, filled / 12);
      const value = clamp01(0.4 * assessment + 0.6 * filledRatio);
      const uncertainty = clamp01(1 - value * 0.8);
      return {
        value,
        uncertainty,
        inputs: {
          assessment_completed: !!diag?.brand_assessment_completed_at,
          identity_fields_filled: filled,
          identity_fields_target: 12,
        },
        last_reinforced_at: diag?.brand_assessment_completed_at ?? null,
      };
    };

    // -------- 2. edge --------
    const edgeFn = (): FacetResult => {
      const relevant = events.filter(
        (e) => e.event_type === "capture" || e.event_type === "document",
      );
      let raw = 0;
      let lastTs: string | null = null;
      for (const e of relevant) {
        if (!e.occurred_at) continue;
        const d = daysBetween(now, new Date(e.occurred_at));
        raw += recencyWeight(d);
        lastTs = maxTs(lastTs, e.occurred_at);
      }
      raw += 0.5 * Math.log(1 + fragmentCount);
      const value = clamp01(raw / 25);
      const uncertainty = clamp01(Math.max(0.15, 1 - fragmentCount / 100));
      return {
        value,
        uncertainty,
        inputs: {
          capture_document_events: relevant.length,
          fragment_count: fragmentCount,
          raw_score: raw,
        },
        last_reinforced_at: lastTs,
      };
    };

    // -------- 3. voice --------
    const voiceFn = (): FacetResult => {
      const primary = voiceProfiles.find((p) => p.is_primary === true);
      const secondary = voiceProfiles.find((p) => p.is_primary !== true);
      const primaryHasTone = !!(primary && primary.tone && String(primary.tone).trim() !== "");
      const secondaryExists = !!secondary;
      const totalExamples = voiceProfiles.reduce((acc, p) => {
        const ex = p.example_posts;
        const n = Array.isArray(ex) ? ex.length : 0;
        return acc + n;
      }, 0);
      const value = clamp01(
        0.5 * (primaryHasTone ? 1 : 0) +
          0.2 * (secondaryExists ? 1 : 0) +
          0.3 * clamp01(totalExamples / 12),
      );
      let uncertainty = 0.5;
      if (primary?.updated_at) {
        const d = daysBetween(now, new Date(primary.updated_at));
        uncertainty = d < 30 ? 0.2 : 0.5;
      }
      const lastTs = voiceProfiles.reduce<string | null>(
        (acc, p) => maxTs(acc, p.updated_at),
        null,
      );
      return {
        value,
        uncertainty: clamp01(uncertainty),
        inputs: {
          primary_has_tone: primaryHasTone,
          secondary_exists: secondaryExists,
          total_example_posts: totalExamples,
          profiles: voiceProfiles.length,
        },
        last_reinforced_at: lastTs,
      };
    };

    // -------- 4. focus --------
    const focusFn = (): FacetResult => {
      let live = 0, evergreen = 0, emerging = 0;
      let strengthSum = 0, strengthCount = 0;
      let lastTs: string | null = null;
      for (const s of activeSignals) {
        const tier = String(s.lifecycle_tier || "").toLowerCase();
        if (tier === "live") live++;
        else if (tier === "evergreen") evergreen++;
        else if (tier === "emerging") emerging++;
        const str = Number(s.strength_score);
        if (Number.isFinite(str)) {
          strengthSum += str;
          strengthCount++;
        }
        lastTs = maxTs(lastTs, s.updated_at);
      }
      const avgStrength = strengthCount > 0 ? strengthSum / strengthCount : 0;
      let value = (1.0 * live + 0.6 * evergreen + 0.3 * emerging) / 12;
      value = value * (0.5 + avgStrength);
      value = clamp01(value);
      const uncertainty = clamp01(Math.max(0.1, 1 - activeSignals.length / 15));
      return {
        value,
        uncertainty,
        inputs: {
          live,
          evergreen,
          emerging,
          active_signal_count: activeSignals.length,
          avg_strength: avgStrength,
        },
        last_reinforced_at: lastTs,
      };
    };

    // -------- 5. audience --------
    const audienceFn = (): FacetResult => {
      const demoExists = demographicsCount > 0 ? 1 : 0;
      // Follower delta over last 30d — use diff of two latest snapshots when both exist
      let growth30d = 0;
      if (snapshots.length >= 2) {
        const newest = Number(snapshots[0].followers);
        const older = Number(snapshots[1].followers);
        if (Number.isFinite(newest) && Number.isFinite(older)) {
          growth30d = newest - older;
        }
      } else if (snapshots.length === 1) {
        const g = Number(snapshots[0].follower_growth);
        if (Number.isFinite(g)) growth30d = g;
      }
      const positiveGrowth = Math.max(0, growth30d);
      const value = clamp01(0.4 * demoExists + 0.6 * clamp01(positiveGrowth / 200));
      const uncertainty = demoExists ? 0.3 : 0.8;
      const lastTs = snapshots[0]?.snapshot_date ?? null;
      return {
        value,
        uncertainty: clamp01(uncertainty),
        inputs: {
          demographics_rows: demographicsCount,
          follower_growth_30d: growth30d,
          snapshot_count: snapshots.length,
        },
        last_reinforced_at: lastTs,
      };
    };

    // -------- 6. discernment --------
    const discernmentFn = (): FacetResult => {
      const total = publishedPosts.length;
      const withSignal = publishedPosts.filter((p) => p.source_signal_id).length;
      const share = total > 0 ? withSignal / total : 0;
      const value = clamp01(share * 0.7 + 0.3 * (hasCritique ? 1 : 0));
      const lastTs = publishedPosts.reduce<string | null>(
        (acc, p) => maxTs(acc, p.published_at, p.created_at),
        null,
      );
      return {
        value,
        uncertainty: 0.4,
        inputs: {
          published_posts: total,
          posts_with_source_signal: withSignal,
          share_with_signal: share,
          has_critique_notification: hasCritique,
        },
        last_reinforced_at: lastTs,
      };
    };

    // -------- 7. conviction --------
    const convictionFn = (): FacetResult => {
      const postEvents = events.filter((e) => e.event_type === "post");
      let weighted = 0;
      let lastTs: string | null = null;
      let posts90d = 0;
      for (const e of postEvents) {
        if (!e.occurred_at) continue;
        const d = daysBetween(now, new Date(e.occurred_at));
        weighted += recencyWeight(d);
        if (d <= 90) posts90d++;
        lastTs = maxTs(lastTs, e.occurred_at);
      }
      const value = clamp01(weighted / 6);
      const uncertainty = clamp01(Math.max(0.2, 1 - posts90d / 12));
      return {
        value,
        uncertainty,
        inputs: {
          post_events_total: postEvents.length,
          post_events_90d: posts90d,
          weighted_recency: weighted,
        },
        last_reinforced_at: lastTs,
      };
    };

    const computed: Record<Facet, FacetResult> = {
      identity: identityFn(),
      edge: edgeFn(),
      voice: voiceFn(),
      focus: focusFn(),
      audience: audienceFn(),
      discernment: discernmentFn(),
      conviction: convictionFn(),
    };

    // -------- Upsert all 7 in a single call --------
    const rows = (Object.keys(computed) as Facet[]).map((f) => ({
      user_id,
      facet: f,
      value: computed[f].value,
      uncertainty: computed[f].uncertainty,
      inputs: computed[f].inputs,
      last_reinforced_at: computed[f].last_reinforced_at,
    }));

    const { error: upsertErr } = await admin
      .from("facet_states")
      .upsert(rows, { onConflict: "user_id,facet" });

    if (upsertErr) return json({ error: `facet upsert failed: ${upsertErr.message}` }, 500);

    // -------- Mark unprocessed events as processed --------
    const { data: marked, error: markErr } = await admin
      .from("source_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .is("processed_at", null)
      .select("id");

    if (markErr) return json({ error: `event processed update failed: ${markErr.message}` }, 500);

    const facetsOut: Record<string, { value: number; uncertainty: number }> = {};
    for (const f of Object.keys(computed) as Facet[]) {
      facetsOut[f] = {
        value: computed[f].value,
        uncertainty: computed[f].uncertainty,
      };
    }

    return json({
      success: true,
      facets: facetsOut,
      events_processed: marked?.length ?? 0,
    });
  } catch (error) {
    console.error("integrate-facets error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});