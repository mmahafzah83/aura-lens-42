import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const claims = claimsData?.claims as Record<string, unknown> | undefined;
    const userId = claims?.sub as string | undefined;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);

    let email = (claims?.email as string | undefined)?.toLowerCase();
    if (!email) {
      const { data: adminUser } = await admin.auth.admin.getUserById(userId);
      email = adminUser?.user?.email?.toLowerCase();
    }
    if (!email) {
      return new Response(JSON.stringify({ ok: true, updated: false, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row } = await admin
      .from("beta_allowlist")
      .select("id,status")
      .eq("email", email)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ ok: true, updated: false, reason: "not_on_allowlist" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (row.status === "active") {
      return new Response(JSON.stringify({ ok: true, updated: false, status: "active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { error: updErr } = await admin
      .from("beta_allowlist")
      .update({
        status: "active",
        activated_at: new Date().toISOString(),
        user_id: userId,
      })
      .eq("id", row.id);
    if (updErr) {
      console.error("[mark-user-active] update failed", updErr);
      return new Response(JSON.stringify({ error: "Update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, updated: true, status: "active" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[mark-user-active] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});