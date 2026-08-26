import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { isAdmin } from "../_shared/adminRole.ts";

import { provisionAccount } from "../_shared/provisionAccount.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** A 16-character password from the platform CSPRNG. Never logged, anywhere. */
function generatePassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await isAdmin(userClient, callerId))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const email = `aura.qa+${Math.floor(Date.now() / 1000)}@aura-intel.org`;
    const password = generatePassword();

    /* email_confirm bypasses the confirmation mail; password_set bypasses the
       PasswordGate. A QA member must be able to walk the journey immediately. */
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { password_set: true },
    });
    if (createErr || !created?.user) {
      // The password is never included in any log line.
      console.error("[qa-account] createUser failed", createErr?.message);
      return new Response(JSON.stringify({ error: createErr?.message || "Could not create the account" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_id = created.user.id;

    // Same single provisioning writer every other path uses.
    await provisionAccount(admin, user_id, "comped");

    const { error: allowErr } = await admin.from("beta_allowlist").insert({
      email,
      status: "active",
      source: "qa",
      user_id,
      name: "QA test member",
      activated_at: new Date().toISOString(),
    });
    if (allowErr) console.warn("[qa-account] allowlist insert failed", allowErr.message);

    try {
      await admin.from("admin_action_log").insert({
        actor_id: callerId,
        action: "create_qa_account",
        task: "create_qa_account",
        target_ref: email,
        result: "created",
      });
    } catch { /* audit is best effort */ }

    return new Response(JSON.stringify({ ok: true, email, password, user_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[qa-account] error", e?.message);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});