import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { derivePillars } from "../_shared/brandPillars.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: CRON_SECRET only. Accept either `x-cron-secret` header or
  // `Authorization: Bearer <CRON_SECRET>`. No other gate, no fallback.
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const headerSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (headerSecret !== expected && bearer !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("diagnostic_profiles")
    .select("user_id, brand_pillars, brand_assessment_results")
    .not("brand_assessment_completed_at", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates = (data || []).filter((r: any) => {
    const cur = r.brand_pillars;
    return !Array.isArray(cur) || cur.length === 0;
  });

  let updated = 0;
  let skipped = 0;
  const updates: Array<{ user_id: string; pillars: string[] }> = [];

  for (const row of candidates) {
    const pillars = derivePillars((row as any).brand_assessment_results);
    if (pillars.length === 0) {
      skipped++;
      continue;
    }
    const { error: updErr } = await supabase
      .from("diagnostic_profiles")
      .update({ brand_pillars: pillars })
      .eq("user_id", (row as any).user_id);
    if (updErr) {
      skipped++;
      continue;
    }
    updated++;
    updates.push({ user_id: (row as any).user_id, pillars });
  }

  return new Response(
    JSON.stringify({
      scanned: candidates.length,
      updated,
      skipped,
      updates,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});