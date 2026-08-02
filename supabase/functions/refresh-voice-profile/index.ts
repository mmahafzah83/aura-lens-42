/**
 * Retrain the member's voice profile from the posts they actually wrote.
 *
 * Runs after any successful import, on demand from the studio, and weekly on
 * a cron for every member with an active LinkedIn connection.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withObserve } from "../_shared/observe.ts";
import { refreshVoiceProfiles } from "../_shared/voiceRefresh.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(withObserve("refresh-voice-profile", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isCron = body?.mode === "all" &&
      (!cronSecret || req.headers.get("x-cron-secret") === cronSecret ||
        req.headers.get("Authorization") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`);

    if (isCron) {
      const { data: members } = await db
        .from("linkedin_connections")
        .select("user_id")
        .eq("status", "active");
      const results: Record<string, unknown> = {};
      for (const m of members ?? []) {
        try {
          results[m.user_id] = await refreshVoiceProfiles(db, m.user_id);
        } catch (e) {
          results[m.user_id] = { error: (e as Error).message };
        }
      }
      console.log(`[refresh-voice-profile] weekly run over ${Object.keys(results).length} members`);
      return json({ success: true, mode: "all", members: Object.keys(results).length, results });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const result = await refreshVoiceProfiles(db, user.id);
    console.log(`[refresh-voice-profile] ${user.id}: ${JSON.stringify(result.languages)}`);
    return json({ success: true, ...result });
  } catch (err) {
    console.error("refresh-voice-profile error:", err);
    return json({ error: "Refresh failed", details: (err as Error).message }, 500);
  }
}));