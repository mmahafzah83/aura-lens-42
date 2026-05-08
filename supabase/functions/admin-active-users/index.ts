import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;
    if (claimsErr || callerId !== ADMIN_USER_ID) {
      console.error("[admin-active-users] auth failed", claimsErr, callerId);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: allowRows } = await admin
      .from("beta_allowlist")
      .select("email, sector, user_id, activated_at")
      .eq("status", "active");

    const results: any[] = [];
    for (const row of allowRows || []) {
      let userId = row.user_id as string | null;
      let lastSignIn: string | null = null;
      let firstName: string | null = null;

      // Fetch auth user by email if needed
      try {
        const { data: authList } = await admin.auth.admin.listUsers({
          page: 1, perPage: 200,
        });
        const authUser = authList?.users?.find(
          (u: any) => (u.email || "").toLowerCase() === row.email.toLowerCase()
        );
        if (authUser) {
          userId = userId || authUser.id;
          lastSignIn = authUser.last_sign_in_at || null;
        }
      } catch (e) {
        console.warn("listUsers failed", e);
      }

      let captures = 0;
      if (userId) {
        const { data: prof } = await admin
          .from("diagnostic_profiles")
          .select("first_name")
          .eq("user_id", userId)
          .maybeSingle();
        firstName = (prof as any)?.first_name || null;

        const { count } = await admin
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        captures = count || 0;
      }

      results.push({
        email: row.email,
        sector: row.sector,
        first_name: firstName,
        last_sign_in_at: lastSignIn,
        activated_at: row.activated_at,
        captures,
      });
    }

    results.sort((a, b) => {
      const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
      const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
      return tb - ta;
    });

    return new Response(JSON.stringify({ users: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[admin-active-users] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});