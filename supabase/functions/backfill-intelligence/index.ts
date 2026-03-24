import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Collect all sources to register
    const sources: { source_type: string; source_id: string; title: string; preview: string }[] = [];

    // 1. Entries
    const { data: entries } = await adminClient
      .from("entries")
      .select("id, title, content, type")
      .eq("user_id", user.id)
      .limit(500);
    for (const e of entries || []) {
      sources.push({
        source_type: "entry",
        source_id: e.id,
        title: e.title || `${e.type} entry`,
        preview: (e.content || "").slice(0, 500),
      });
    }

    // 2. Documents
    const { data: docs } = await adminClient
      .from("documents")
      .select("id, filename, summary, file_type")
      .eq("user_id", user.id)
      .eq("status", "ready")
      .limit(200);
    for (const d of docs || []) {
      sources.push({
        source_type: "document",
        source_id: d.id,
        title: d.filename,
        preview: (d.summary || "").slice(0, 500),
      });
    }

    // 3. Frameworks
    const { data: frameworks } = await adminClient
      .from("master_frameworks")
      .select("id, title, summary")
      .eq("user_id", user.id)
      .limit(200);
    for (const f of frameworks || []) {
      sources.push({
        source_type: "framework",
        source_id: f.id,
        title: f.title,
        preview: (f.summary || "").slice(0, 500),
      });
    }

    // 4. Learned Intelligence
    const { data: intelligence } = await adminClient
      .from("learned_intelligence")
      .select("id, title, content, intelligence_type")
      .eq("user_id", user.id)
      .limit(500);
    for (const li of intelligence || []) {
      sources.push({
        source_type: "intelligence",
        source_id: li.id,
        title: li.title,
        preview: (li.content || "").slice(0, 500),
      });
    }

    // Register all sources (upsert to avoid duplicates)
    let registered = 0;
    let alreadyProcessed = 0;

    for (const src of sources) {
      const { data: existing } = await adminClient
        .from("source_registry")
        .select("id, processed")
        .eq("user_id", user.id)
        .eq("source_type", src.source_type)
        .eq("source_id", src.source_id)
        .maybeSingle();

      if (existing) {
        if (existing.processed) alreadyProcessed++;
        continue;
      }

      await adminClient.from("source_registry").insert({
        user_id: user.id,
        source_type: src.source_type,
        source_id: src.source_id,
        title: src.title,
        content_preview: src.preview,
      });
      registered++;
    }

    // Process unprocessed sources (limit batch to 5 to avoid timeout)
    const { data: unprocessed } = await adminClient
      .from("source_registry")
      .select("id, source_type, source_id")
      .eq("user_id", user.id)
      .eq("processed", false)
      .limit(5);

    let processed = 0;
    for (const src of unprocessed || []) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/extract-evidence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_registry_id: src.id,
            user_id: user.id,
          }),
        });
        if (res.ok) processed++;
      } catch (e) {
        console.error(`Failed to process ${src.id}:`, e);
      }
    }

    const { count: remainingCount } = await adminClient
      .from("source_registry")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("processed", false);

    return new Response(JSON.stringify({
      success: true,
      total_sources: sources.length,
      newly_registered: registered,
      already_processed: alreadyProcessed,
      processed_this_batch: processed,
      remaining_unprocessed: remainingCount || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("backfill-intelligence error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
