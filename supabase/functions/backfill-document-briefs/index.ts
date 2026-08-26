/**
 * backfill-document-briefs — admin only, never scheduled.
 *
 * Walks completed documents oldest first, one at a time, and builds the brief
 * that document never got. Self-chains until nothing is left.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isAdmin } from "../_shared/adminRole.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIPELINE_VERSION = 1;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const internal = !!bearer && bearer === serviceKey;
  if (!internal) {
    if (!bearer) return json({ error: "Unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(bearer);
    if (!(await isAdmin(admin, u?.user?.id))) return json({ error: "Forbidden" }, 403);
  }

  const { data: done } = await admin
    .from("document_briefs")
    .select("document_id")
    .eq("pipeline_version", PIPELINE_VERSION);
  const haveComplete = new Set(
    ((done || []) as any[]).filter((r) => r.document_id).map((r) => r.document_id as string),
  );

  const { data: docs } = await admin
    .from("documents")
    .select("id, created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: true })
    .limit(500);

  const pending = ((docs || []) as any[]).filter((d) => !haveComplete.has(d.id));
  const next = pending[0];

  let processed = 0;
  if (next) {
    try {
      await admin.functions.invoke("build-document-brief", { body: { document_id: next.id } });
      processed = 1;
    } catch (e) {
      console.error("[backfill-document-briefs] build failed:", (e as Error).message);
    }
  }

  const { data: scores } = await admin
    .from("document_briefs")
    .select("grounding_score")
    .not("grounding_score", "is", null);
  const arr = ((scores || []) as any[]).map((r) => Number(r.grounding_score)).filter((n) => !Number.isNaN(n));
  const avg = arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4)) : null;

  const remaining = Math.max(0, pending.length - processed);
  if (next && remaining > 0) {
    try {
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      EdgeRuntime.waitUntil((async () => {
        try {
          await admin.functions.invoke("backfill-document-briefs", { body: {} });
        } catch (e) {
          console.error("[backfill-document-briefs] chain failed:", (e as Error).message);
        }
      })());
    } catch { /* EdgeRuntime unavailable */ }
  }

  return json({ processed, remaining, avg_grounding_score: avg });
});
