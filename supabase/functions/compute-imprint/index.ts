import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    let userId: string | null = null;
    if (isServiceRole || isCron) {
      if (body && body.all_users === true) {
        const adminSweep = createClient(supabaseUrl, serviceKey);
        const { data: profs, error: profsErr } = await adminSweep
          .from("diagnostic_profiles")
          .select("user_id");
        if (profsErr) {
          return new Response(JSON.stringify({ error: profsErr.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const ids = Array.from(
          new Set(((profs as any[]) || []).map((p) => p.user_id).filter(Boolean)),
        );
        const failures: string[] = [];
        let users_processed = 0;
        for (const uid of ids) {
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/compute-imprint`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
              },
              body: JSON.stringify({ user_id: uid }),
            });
            if (!r.ok) {
              const t = await r.text();
              console.error(`[compute-imprint] user ${uid} failed: ${r.status} ${t}`);
              failures.push(uid);
            } else {
              users_processed++;
            }
          } catch (e) {
            console.error(`[compute-imprint] user ${uid} threw:`, (e as Error).message);
            failures.push(uid);
          }
        }
        return new Response(JSON.stringify({ success: true, users_processed, failures }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (body && typeof body.user_id === "string" && body.user_id.length > 0) {
        userId = body.user_id;
      } else {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(bearer);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Invoke calculate-aura-score (EF→EF, service-role)
    const scoreRes = await fetch(`${supabaseUrl}/functions/v1/calculate-aura-score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!scoreRes.ok) {
      const txt = await scoreRes.text();
      return new Response(JSON.stringify({ error: "calculate-aura-score failed", detail: txt }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const scorePayload = await scoreRes.json();
    const aura_score = Number(scorePayload?.aura_score ?? 0);
    const score_components = {
      capture_score: scorePayload?.capture_score ?? null,
      signal_score: scorePayload?.signal_score ?? null,
      content_score: scorePayload?.content_score ?? null,
    };

    // 2. Facet states
    const { data: facetRows, error: facetErr } = await admin
      .from("facet_states")
      .select("facet,value,uncertainty")
      .eq("user_id", userId);
    if (facetErr) {
      return new Response(JSON.stringify({ error: facetErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!facetRows || facetRows.length === 0) {
      return new Response(JSON.stringify({ error: "facets not computed" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let weightedSum = 0;
    let weightTotal = 0;
    const facet_vector: Record<string, { value: number; uncertainty: number }> = {};
    for (const r of facetRows as any[]) {
      const v = Number(r.value) || 0;
      const u = Number(r.uncertainty) || 0;
      const w = 1 - u;
      weightedSum += v * w;
      weightTotal += w;
      facet_vector[r.facet] = { value: v, uncertainty: u };
    }
    const facet_certainty_mean = weightTotal > 0 ? weightedSum / weightTotal : 0;

    // 3. Imprint
    const raw = 0.7 * aura_score + 0.3 * (100 * facet_certainty_mean);
    const imprint = Math.max(0, Math.min(100, Math.round(raw)));

    // 4. Insert imprint_snapshots
    const { data: snapIns, error: snapErr } = await admin
      .from("imprint_snapshots")
      .insert({
        user_id: userId,
        imprint,
        formula_version: 1,
        facet_vector,
        components: {
          aura_score,
          score_components,
          facet_certainty_mean,
          blend: { score: 0.7, facets: 0.3 },
        },
      })
      .select("id")
      .single();
    if (snapErr) {
      return new Response(JSON.stringify({ error: snapErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Insert eval_metrics
    await admin.from("eval_metrics").insert({
      user_id: userId,
      metric: "imprint_score_delta",
      value: imprint - aura_score,
      context: { formula_version: 1, facet_certainty_mean },
    });

    // 6. Response
    return new Response(JSON.stringify({
      success: true,
      imprint,
      aura_score,
      facet_certainty_mean,
      snapshot_id: (snapIns as any)?.id ?? null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compute-imprint error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});