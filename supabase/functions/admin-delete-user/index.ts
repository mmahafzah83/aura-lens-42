import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

// Tables that store per-user data. Order doesn't matter (no FK cascades),
// but we attempt all and log any failures gracefully.
const TABLES_TO_CLEAN = [
  "aura_conversation_memory",
  "linkedin_post_metrics",
  "linkedin_posts",
  "content_items",
  "content_topics",
  "evidence_fragments",
  "strategic_signals",
  "score_snapshots",
  "authority_scores",
  "user_milestones",
  "milestones",
  "authority_voice_profiles",
  "market_mirror_cache",
  "narrative_suggestions",
  "industry_trends",
  "framework_activations",
  "master_frameworks",
  "learned_intelligence",
  "document_chunks",
  "documents",
  "captures",
  "entries",
  "diagnostic_profiles",
  "influence_snapshots",
  "import_jobs",
  "discovery_review_queue",
  "focus_accounts",
  "chat_messages",
  "chat_conversations",
  "notifications",
  "notification_events",
  "beta_feedback",
  "lifecycle_emails",
  "linkedin_connections",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) {
      console.error("[admin-delete-user] auth failed", claimsErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (callerId !== ADMIN_USER_ID) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    let target_user_id: string | null =
      typeof body.target_user_id === "string" ? body.target_user_id.trim() : null;
    const target_email: string | null =
      typeof body.target_email === "string" ? body.target_email.trim().toLowerCase() : null;

    if (!target_user_id && !target_email) {
      return new Response(JSON.stringify({ error: "target_user_id or target_email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (target_user_id && !UUID_RE.test(target_user_id)) {
      return new Response(JSON.stringify({ error: "Invalid target_user_id format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve email <-> user_id via auth admin
    let resolvedEmail: string | null = target_email;
    if (target_user_id) {
      const { data: authUser } = await admin.auth.admin.getUserById(target_user_id);
      if (authUser?.user?.email) resolvedEmail = authUser.user.email.toLowerCase();
    } else if (target_email) {
      // Find auth user by email via listUsers (paginated; covers <1000 users fine)
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users?.find((u: any) => (u.email || "").toLowerCase() === target_email);
      if (found) target_user_id = found.id;
    }

    if (target_user_id === ADMIN_USER_ID || target_user_id === callerId) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let tablesCleaned = 0;
    if (target_user_id) {
      for (const table of TABLES_TO_CLEAN) {
        const { error } = await admin.from(table).delete().eq("user_id", target_user_id);
        if (error) {
          console.log(`[admin-delete-user] note: ${table}: ${error.message}`);
        } else {
          tablesCleaned++;
        }
      }
    }

    // Remove from beta_allowlist (by email — covers pending users with no auth)
    if (resolvedEmail) {
      const { error: allowErr } = await admin
        .from("beta_allowlist").delete().eq("email", resolvedEmail);
      if (allowErr) console.log(`[admin-delete-user] allowlist: ${allowErr.message}`);
    }

    // Finally remove auth user (if it exists)
    if (target_user_id) {
      const { error: authErr } = await admin.auth.admin.deleteUser(target_user_id);
      if (authErr && !/not found/i.test(authErr.message)) {
        return new Response(JSON.stringify({ error: `Auth delete failed: ${authErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      deleted_user_id: target_user_id,
      deleted_email: resolvedEmail,
      tables_cleaned: tablesCleaned,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[admin-delete-user] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});