import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { canonicalizeTags } from "../_shared/themeCanon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

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
    const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    if (!isServiceRole && !isCron) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let scanned = 0;
    let updated = 0;
    const pageSize = 500;
    let from = 0;

    while (true) {
      const { data: rows, error } = await admin
        .from("strategic_signals")
        .select("id, theme_tags")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`fetch: ${error.message}`);
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        scanned++;
        const current: string[] = Array.isArray(row.theme_tags) ? row.theme_tags : [];
        const canonical = canonicalizeTags(current);
        if (!arraysEqual(current, canonical)) {
          const { error: upErr } = await admin
            .from("strategic_signals")
            .update({ theme_tags: canonical })
            .eq("id", row.id);
          if (upErr) {
            console.error("[backfill-theme-tags] update failed", row.id, upErr.message);
          } else {
            updated++;
          }
        }
      }

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    console.log(`[backfill-theme-tags] scanned=${scanned} updated=${updated}`);

    return new Response(JSON.stringify({ success: true, scanned, updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-theme-tags error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});