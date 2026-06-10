import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EVENT_TYPES = ["capture", "document", "post", "assessment", "voice_note", "import"] as const;
const SOURCE_TABLES = ["entries", "documents", "linkedin_posts", "captures"] as const;

type EventType = typeof EVENT_TYPES[number];
type SourceTable = typeof SOURCE_TABLES[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    let user_id: string | null = null;
    if (isServiceRole || isCron) {
      if (body && typeof body.user_id === "string") user_id = body.user_id;
    } else {
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !user) return json({ error: "Unauthorized" }, 401);
      user_id = user.id;
    }

    if (!user_id) return json({ error: "user_id required" }, 400);

    const { event_type, source_table, source_id, occurred_at, payload } = body || {};

    if (!event_type || !EVENT_TYPES.includes(event_type as EventType)) {
      return json({ error: `invalid event_type; must be one of ${EVENT_TYPES.join(", ")}` }, 400);
    }
    if (!source_table || !SOURCE_TABLES.includes(source_table as SourceTable)) {
      return json({ error: `invalid source_table; must be one of ${SOURCE_TABLES.join(", ")}` }, 400);
    }
    if (!source_id || typeof source_id !== "string") {
      return json({ error: "source_id required" }, 400);
    }
    if (occurred_at && typeof occurred_at !== "string") {
      return json({ error: "occurred_at must be ISO string" }, 400);
    }
    if (payload !== undefined && (typeof payload !== "object" || payload === null || Array.isArray(payload))) {
      return json({ error: "payload must be an object" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Integrity check: row exists and belongs to user
    const { data: refRow, error: refErr } = await admin
      .from(source_table)
      .select("id, user_id")
      .eq("id", source_id)
      .maybeSingle();

    if (refErr) return json({ error: `lookup failed: ${refErr.message}` }, 500);
    if (!refRow) return json({ error: "source row not found" }, 404);
    if ((refRow as any).user_id !== user_id) {
      return json({ error: "source row does not belong to user" }, 403);
    }

    const insertRow = {
      user_id,
      event_type,
      source_table,
      source_id,
      occurred_at: occurred_at || new Date().toISOString(),
      payload: payload || {},
    };

    const { data: inserted, error: insErr } = await admin
      .from("source_events")
      .insert(insertRow)
      .select("id")
      .maybeSingle();

    if (inserted?.id) {
      return json({ success: true, event_id: inserted.id, duplicate: false });
    }

    // Conflict path (unique constraint) — fetch existing row id
    if (insErr && (insErr as any).code === "23505") {
      const { data: existing, error: exErr } = await admin
        .from("source_events")
        .select("id")
        .eq("user_id", user_id)
        .eq("source_table", source_table)
        .eq("source_id", source_id)
        .eq("event_type", event_type)
        .maybeSingle();
      if (exErr || !existing) {
        return json({ error: `duplicate detected but lookup failed: ${exErr?.message || "not found"}` }, 500);
      }
      return json({ success: true, event_id: existing.id, duplicate: true });
    }

    if (insErr) return json({ error: `insert failed: ${insErr.message}` }, 500);
    return json({ error: "insert returned no row" }, 500);
  } catch (error) {
    console.error("ingest-source-event error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});