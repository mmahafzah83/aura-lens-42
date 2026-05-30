import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Resolve user from JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const { id, kind } = body || {};
    if (!id || (kind !== "entry" && kind !== "document")) {
      return new Response(JSON.stringify({ error: "id and kind ('entry'|'document') required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Ownership check on the underlying record
    const sourceTable = kind === "document" ? "documents" : "entries";
    const { data: ownRow, error: ownErr } = await admin
      .from(sourceTable).select("id, user_id").eq("id", id).maybeSingle();
    if (ownErr) throw new Error(`Lookup failed: ${ownErr.message}`);
    if (!ownRow || ownRow.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Find source_registry rows for this source (scoped to user)
    const { data: regRows } = await admin
      .from("source_registry")
      .select("id")
      .eq("user_id", userId)
      .eq("source_type", kind)
      .eq("source_id", id);
    const registryIds = (regRows || []).map((r: any) => r.id);

    // 2. Collect fragment ids under those registries
    let removedFragmentIds: string[] = [];
    if (registryIds.length) {
      const { data: fragRows } = await admin
        .from("evidence_fragments")
        .select("id")
        .in("source_registry_id", registryIds);
      removedFragmentIds = (fragRows || []).map((f: any) => f.id);
    }

    // 3a. Delete source_registry rows (CASCADE removes evidence_fragments)
    if (registryIds.length) {
      const { error: delRegErr } = await admin
        .from("source_registry").delete().in("id", registryIds);
      if (delRegErr) throw new Error(`source_registry delete: ${delRegErr.message}`);
    }

    // 3b. Delete the entry/document row
    const { error: delSrcErr } = await admin
      .from(sourceTable).delete().eq("id", id).eq("user_id", userId);
    if (delSrcErr) throw new Error(`${sourceTable} delete: ${delSrcErr.message}`);

    // 4. Prune signals' supporting_evidence_ids + recompute fragment_count DOWN
    let signalsUpdated = 0;
    if (removedFragmentIds.length) {
      const removedSet = new Set(removedFragmentIds);
      // Fetch user's signals that might intersect. Filter in code (uuid[] overlap operator
      // not trivially expressible via supabase-js; user-scoped row count is small).
      const { data: sigs } = await admin
        .from("strategic_signals")
        .select("id, supporting_evidence_ids, fragment_count")
        .eq("user_id", userId)
        .overlaps("supporting_evidence_ids", removedFragmentIds);

      for (const s of (sigs || []) as any[]) {
        const current: string[] = s.supporting_evidence_ids || [];
        const pruned = current.filter((fid) => !removedSet.has(fid));
        if (pruned.length === current.length) continue;
        const { error: updErr } = await admin
          .from("strategic_signals")
          .update({
            supporting_evidence_ids: pruned,
            fragment_count: pruned.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", s.id)
          .eq("user_id", userId);
        if (!updErr) signalsUpdated++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      registry_rows_deleted: registryIds.length,
      fragments_deleted: removedFragmentIds.length,
      signals_updated: signalsUpdated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[delete-source] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});