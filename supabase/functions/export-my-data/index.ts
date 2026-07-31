import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import JSZip from "https://esm.sh/jszip@3.10.1";

// User-content tables only. Internal/telemetry tables (ef_error_log, job_queue,
// sync_*, product_events, output_leak_log, ai_usage_log, *_retired_*) are
// operations data and are deliberately excluded.
const TABLES = [
  "diagnostic_profiles",
  "entries",
  "documents",
  "evidence_fragments",
  "strategic_signals",
  "signal_engagements",
  "signal_topic_preferences",
  "linkedin_posts",
  "linkedin_post_metrics",
  "authority_voice_profiles",
  "training_logs",
  "draft_edits",
  "score_snapshots",
  "imprint_snapshots",
  "user_milestones",
  "weekly_missions",
  "impact_narratives",
  "focus_accounts",
  "aura_conversation_memory",
  "chat_conversations",
  "chat_messages",
  "beta_feedback",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Caller-scoped client only. RLS enforces row ownership; no service role here.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;

  const zip = new JSZip();
  const counts: Record<string, number> = {};
  const empty: string[] = [];
  const errored: { table: string; error: string }[] = [];

  const PAGE = 1000;

  // Sequential on purpose: keeps memory flat and avoids timeouts.
  for (const table of TABLES) {
    try {
      // Paginate: PostgREST caps a single response, so page until short read.
      const rows: unknown[] = [];
      let from = 0;
      let failed: string | null = null;
      for (;;) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("user_id", userId)
          .range(from, from + PAGE - 1);
        if (error) { failed = error.message; break; }
        const batch = data ?? [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      if (failed) {
        errored.push({ table, error: failed });
        continue;
      }
      counts[table] = rows.length;
      if (rows.length === 0) {
        empty.push(table);
        continue;
      }
      zip.file(`${table}.json`, JSON.stringify(rows, null, 2));
    } catch (e) {
      errored.push({ table, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const now = new Date();
  const manifest = {
    export_generated_at: now.toISOString(),
    user_id: userId,
    tables_requested: TABLES.length,
    row_counts: counts,
    skipped_empty_tables: empty,
    errored_tables: errored,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  zip.file(
    "README.txt",
    [
      "Aura data export",
      "",
      `Generated: ${now.toISOString()}`,
      `Account: ${userId}`,
      "",
      "What is in this archive",
      "-----------------------",
      "Each JSON file contains the rows stored for your account in the table named by the file.",
      "Files are pretty-printed JSON arrays and can be opened in any text editor.",
      "Tables that held no rows for your account are not written as files; they are listed in",
      "manifest.json under skipped_empty_tables. Any table that could not be read is listed",
      "under errored_tables with the reason.",
      "",
      "manifest.json lists the export timestamp, your account identifier, the row count for",
      "each table, and the skipped or errored tables.",
      "",
      "Uploaded source files",
      "---------------------",
      "Documents you uploaded (for example PDFs) are listed as metadata records in",
      "documents.json, including their file names. The raw file contents are not included",
      "in this version of the export.",
      "",
      "Operational and telemetry records (error logs, job queues, usage metering) are not",
      "part of this export because they are system records rather than your content.",
      "",
    ].join("\n"),
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const stamp = now.toISOString().slice(0, 10);

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="aura-data-export-${stamp}.zip"`,
    },
  });
});
