// Public sign-up door. Enforces the per-IP account-creation ceiling before an
// account can exist at all, then creates the account with email verification on.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { LIMITS, clientIp, hashIp } from "../_shared/limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, password, origin, consent_version } = await req.json();
    const addr = String(email || "").trim().toLowerCase();
    const pwd = String(password || "");
    if (!addr.includes("@") || addr.length < 5) return json({ error: "Enter a valid email address." }, 400);
    if (pwd.length < 8) return json({ error: "Use eight characters or more." }, 400);
    const version = String(consent_version || "").trim();
    if (!version) return json({ error: "Consent is required before an account can be opened." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ip_hash = await hashIp(clientIp(req));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip_hash)
      .gte("created_at", since);

    if ((count ?? 0) >= LIMITS.SIGNUPS_PER_IP_PER_DAY) {
      return json({
        error:
          "That is as many accounts as can be opened from here today. Write to support@aura-intel.org and it is sorted by hand.",
      }, 429);
    }

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: signUpData, error } = await anon.auth.signUp({
      email: addr,
      password: pwd,
      options: { emailRedirectTo: `${origin || "https://aura-intel.org"}/auth?msg=verified` },
    });
    if (error) return json({ error: error.message }, 400);

    await admin.from("signup_attempts").insert({ ip_hash });

    // Record the consent against the profile row. A ticked box that leaves no
    // record proves nothing later.
    const newUserId = signUpData?.user?.id;
    if (newUserId) {
      const { error: profileError } = await admin
        .from("diagnostic_profiles")
        .upsert(
          {
            user_id: newUserId,
            consented_at: new Date().toISOString(),
            consent_version: version,
          },
          { onConflict: "user_id" },
        );
      if (profileError) console.error("consent record failed", profileError);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error)?.message || "Something went wrong. Try again." }, 500);
  }
});
