import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Derive the caller identity ONLY from the verified JWT.
    // The request body is never read for targeting — a caller can only delete themselves.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Wipe all public data rows in one transaction (all-or-nothing).
    const { error: rpcErr } = await admin.rpc("delete_account", { p_user_id: user.id });
    if (rpcErr) {
      console.error("[delete-account] delete_account rpc failed", rpcErr);
      return new Response(
        JSON.stringify({ error: "We couldn't delete your data. Please try again in a moment." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Best-effort: remove avatar files under `${user.id}/`. Never fatal.
    try {
      const { data: files } = await admin.storage.from("avatars").list(user.id, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        await admin.storage.from("avatars").remove(paths);
      }
    } catch (storageErr) {
      console.warn("[delete-account] avatar cleanup skipped", storageErr);
    }

    // 3) Remove the auth user LAST so we never orphan data rows.
    const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
    if (authErr && !/not found/i.test(authErr.message)) {
      console.error("[delete-account] auth deleteUser failed", authErr);
      return new Response(
        JSON.stringify({ error: "Your data was removed but sign-in couldn't be closed. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[delete-account] unexpected", e);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});