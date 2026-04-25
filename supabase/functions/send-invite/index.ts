import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const REDIRECT_URL = "https://aura-intel.org/home";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;
    if (callerId !== ADMIN_USER_ID) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const personal_note =
      typeof body.personal_note === "string" ? body.personal_note.trim() : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up allowlist row
    const { data: row, error: lookupErr } = await admin
      .from("beta_allowlist")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (lookupErr) {
      console.error("Lookup failed:", lookupErr);
      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let targetRow = row;

    // If not in allowlist, insert a new pending row (direct-invite flow)
    if (!targetRow) {
      const { data: inserted, error: insertErr } = await admin
        .from("beta_allowlist")
        .insert({ email, status: "pending", source: "direct" })
        .select("id, status")
        .single();

      if (insertErr || !inserted) {
        console.error("Insert failed:", insertErr);
        return new Response(JSON.stringify({ error: "Failed to create allowlist entry" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetRow = inserted;
    }

    if (targetRow.status === "approved" || targetRow.status === "active") {
      return new Response(JSON.stringify({ error: "Already invited" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send invite
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: REDIRECT_URL,
    });

    if (inviteErr) {
      console.error("Invite failed:", inviteErr);
      return new Response(
        JSON.stringify({ error: inviteErr.message || "Failed to send invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update allowlist
    const { error: updateErr } = await admin
      .from("beta_allowlist")
      .update({
        status: "approved",
        invited_at: new Date().toISOString(),
        personal_note,
        invited_by: callerId,
      })
      .eq("id", targetRow.id);

    if (updateErr) {
      console.error("Update failed:", updateErr);
      return new Response(JSON.stringify({ error: "Invite sent but record update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ message: `Invite sent to ${email}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});