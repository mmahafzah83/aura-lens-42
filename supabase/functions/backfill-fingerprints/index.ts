import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isAdmin } from "../_shared/adminRole.ts";
import { endingTypeOf, hookStyleOf } from "../_shared/fingerprint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Auth: founder only ---
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!bearer) return json({ error: "Forbidden" }, 403);
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(bearer);
    if (userErr || !user || !(await isAdmin(anonClient, user.id))) return json({ error: "Forbidden" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: rows, error: selErr } = await admin
      .from("linkedin_posts")
      .select("id, post_text, hook_style, ending_type")
      .neq("post_text", "")
      .not("post_text", "is", null)
      .or("hook_style.is.null,ending_type.is.null")
      .limit(BATCH);
    if (selErr) throw new Error(`select failed: ${selErr.message}`);

    const scanned = rows?.length ?? 0;
    let updated_hook = 0;
    let updated_ending = 0;

    for (const row of rows ?? []) {
      const text = String(row.post_text ?? "");
      if (!text.trim()) continue;
      const patch: Record<string, string> = {};
      // Only ever fill a null column — an existing label is never overwritten.
      if (row.hook_style == null) patch.hook_style = hookStyleOf(text);
      if (row.ending_type == null) patch.ending_type = endingTypeOf(text);
      // framework_type is deliberately left alone: no text classifier exists for it.
      if (Object.keys(patch).length === 0) continue;

      const { error: updErr } = await admin.from("linkedin_posts").update(patch).eq("id", row.id);
      if (updErr) throw new Error(`update failed for ${row.id}: ${updErr.message}`);
      if (patch.hook_style) updated_hook += 1;
      if (patch.ending_type) updated_ending += 1;
    }

    const { count, error: remErr } = await admin
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .neq("post_text", "")
      .not("post_text", "is", null)
      .or("hook_style.is.null,ending_type.is.null");
    if (remErr) throw new Error(`remaining count failed: ${remErr.message}`);

    return json({ scanned, updated_hook, updated_ending, remaining: count ?? 0 });
  } catch (error) {
    console.error("backfill-fingerprints error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
