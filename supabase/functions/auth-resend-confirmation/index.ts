// Resend the sign-up confirmation link. Honest by design: if the provider
// rate-limits or errors, we say so — we never report "sent" when nothing was.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { email, origin } = await req.json();
    const addr = String(email || "").trim().toLowerCase();
    if (!addr.includes("@")) return json({ ok: false, error: "Enter a valid email address." });

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { error } = await anon.auth.resend({
      type: "signup",
      email: addr,
      options: { emailRedirectTo: `${origin || "https://aura-intel.org"}/auth?msg=verified` },
    });

    if (error) {
      const raw = String(error.message || "");
      const limited = /rate|too many|seconds|429/i.test(raw);
      return json({
        ok: false,
        code: limited ? "rate_limited" : "send_failed",
        error: limited
          ? "The provider is holding new sends for a moment. Wait a minute and try again."
          : "The link could not be sent just now. Try again in a moment.",
      });
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message || "The link could not be sent just now." });
  }
});
