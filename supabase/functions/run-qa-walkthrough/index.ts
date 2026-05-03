import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_USER = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: any[] = [];

  const run = async (step: number, action: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    let passed = false;
    let error: string | null = null;
    try {
      await fn();
      passed = true;
    } catch (e: any) {
      error = e?.message || String(e);
    }
    results.push({ step, action, passed, error, duration_ms: Date.now() - t0 });
  };

  await run(1, "Auth: getUser", async () => {
    const { data, error } = await admin.auth.admin.getUserById(TARGET_USER);
    if (error) throw error;
    if (!data?.user) throw new Error("No user returned");
  });

  await run(2, "Profile: diagnostic_profiles", async () => {
    const { data, error } = await admin
      .from("diagnostic_profiles")
      .select("first_name, sector_focus")
      .eq("user_id", TARGET_USER)
      .maybeSingle();
    if (error) throw error;
    if (!data?.first_name) throw new Error("Missing first_name");
  });

  await run(3, "Score: calculate-aura-score", async () => {
    const { data, error } = await admin.functions.invoke("calculate-aura-score", {
      body: { user_id: TARGET_USER },
    });
    if (error) throw error;
    if (data?.score === undefined && data?.aura_score === undefined) throw new Error("No score in response");
    if (!data?.tier_name && !data?.tier) throw new Error("No tier_name in response");
  });

  await run(4, "Signals: strategic_signals", async () => {
    const { data, error } = await admin
      .from("strategic_signals")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Not array");
  });

  await run(5, "Industry trends", async () => {
    const { data, error } = await admin
      .from("industry_trends")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Not array");
  });

  await run(6, "Recommended moves", async () => {
    const { data, error } = await admin
      .from("recommended_moves")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Not array");
  });

  await run(7, "Content: linkedin_posts", async () => {
    const { data, error } = await admin
      .from("linkedin_posts")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Not array");
  });

  await run(8, "Score history: score_snapshots (30d)", async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await admin
      .from("score_snapshots")
      .select("id, created_at")
      .eq("user_id", TARGET_USER)
      .gte("created_at", since)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("No score snapshot in last 30 days");
  });

  await run(9, "Entries", async () => {
    const { data, error } = await admin
      .from("entries")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Not array");
  });

  await run(10, "Design system: active row", async () => {
    const { data, error } = await admin
      .from("design_system")
      .select("tokens")
      .eq("scope", "global")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data?.tokens) throw new Error("No active design tokens");
  });

  await run(11, "Conversation memory", async () => {
    const { error } = await admin
      .from("aura_conversation_memory")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
  });

  await run(12, "Voice profile", async () => {
    const { error } = await admin
      .from("authority_voice_profiles")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
  });

  await run(13, "Milestones: user_milestones", async () => {
    const { error } = await admin
      .from("user_milestones")
      .select("id")
      .eq("user_id", TARGET_USER)
      .limit(1);
    if (error) throw error;
  });

  await run(14, "Page backgrounds", async () => {
    const { error } = await admin
      .from("page_backgrounds")
      .select("id")
      .limit(1);
    if (error) throw error;
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  const { data: report, error: insertErr } = await admin
    .from("qa_reports")
    .insert({
      total_checks: results.length,
      passed,
      failed,
      results,
      triggered_by: "manual",
    })
    .select()
    .single();

  return new Response(
    JSON.stringify({
      ok: true,
      report_id: report?.id ?? null,
      total: results.length,
      passed,
      failed,
      results,
      insert_error: insertErr?.message ?? null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});