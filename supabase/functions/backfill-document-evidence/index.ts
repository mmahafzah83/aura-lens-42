import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { withObserve } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Service-role / cron only. Deletes existing fragments for a document's
// source_registry and enqueues a fresh evidence_job so the sliced pipeline
// re-extracts the whole document.
Deno.serve(withObserve("backfill-document-evidence", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const apiKey = req.headers.get("apikey") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized =
    (bearer && bearer === serviceKey) ||
    (apiKey && apiKey === serviceKey) ||
    (CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const documentId: string | undefined = body?.document_id;
  if (!documentId) {
    return new Response(JSON.stringify({ error: "document_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: doc } = await admin
    .from("documents").select("id, user_id, filename").eq("id", documentId).maybeSingle();
  if (!doc) {
    return new Response(JSON.stringify({ error: "document not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find or create the source_registry row for this document.
  let { data: registry } = await admin
    .from("source_registry").select("id, user_id")
    .eq("source_type", "document").eq("source_id", documentId).maybeSingle();
  if (!registry) {
    const { data: created, error: crErr } = await admin.from("source_registry").insert({
      user_id: doc.user_id, source_type: "document", source_id: documentId, title: doc.filename,
    }).select("id, user_id").single();
    if (crErr) throw new Error(`registry insert: ${crErr.message}`);
    registry = created;
  }

  // Delete existing fragments and prune signal references.
  const { data: oldFragRows } = await admin
    .from("evidence_fragments").select("id").eq("source_registry_id", registry.id);
  const oldIds: string[] = (oldFragRows || []).map((r: any) => r.id);
  if (oldIds.length) {
    await admin.from("evidence_fragments").delete().eq("source_registry_id", registry.id);
    const removed = new Set(oldIds);
    const { data: sigs } = await admin
      .from("strategic_signals")
      .select("id, supporting_evidence_ids")
      .eq("user_id", registry.user_id)
      .overlaps("supporting_evidence_ids", oldIds);
    for (const s of (sigs || []) as any[]) {
      const cur: string[] = s.supporting_evidence_ids || [];
      const pruned = cur.filter((x) => !removed.has(x));
      if (pruned.length !== cur.length) {
        await admin.from("strategic_signals").update({
          supporting_evidence_ids: pruned,
          fragment_count: pruned.length,
          updated_at: new Date().toISOString(),
        }).eq("id", s.id);
      }
    }
  }

  // Cancel any in-flight jobs for this source.
  await admin.from("evidence_jobs")
    .update({ status: "failed", error_detail: "superseded by backfill" })
    .eq("source_registry_id", registry.id)
    .in("status", ["queued", "mapping", "reducing"]);

  const { count: totalChunks } = await admin
    .from("document_chunks").select("id", { count: "exact", head: true })
    .eq("document_id", documentId);

  const { data: job, error: jobErr } = await admin.from("evidence_jobs").insert({
    source_registry_id: registry.id,
    user_id: registry.user_id,
    cursor: 0,
    total: totalChunks || 0,
    status: "queued",
  }).select("id").single();
  if (jobErr) throw new Error(`evidence_jobs insert: ${jobErr.message}`);

  // Also clear the processed flag so downstream code re-reads the source.
  await admin.from("source_registry").update({
    processed: false, processed_at: null, fragment_count: 0,
  }).eq("id", registry.id);

  // Kick the slice worker.
  try {
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil((async () => {
      try {
        await admin.functions.invoke("extract-evidence-slice", {
          body: { evidence_job_id: job.id },
        });
      } catch (e) {
        console.error("[backfill-document-evidence] kick failed:", (e as Error).message);
      }
    })());
  } catch { /* noop */ }

  return new Response(JSON.stringify({
    success: true,
    document_id: documentId,
    source_registry_id: registry.id,
    evidence_job_id: job.id,
    total_chunks: totalChunks || 0,
    old_fragments_deleted: oldIds.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}));