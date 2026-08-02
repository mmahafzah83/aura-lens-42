import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  renderEmail, heading, paragraph, note,
} from "../_shared/emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const { email, origin } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    // Basic validation: length + RFC-ish email regex to reduce abuse surface.
    if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Recovery links carry a working token, so the redirect target can never be
    // taken from the caller unchecked — that would be an open redirect. Only
    // production and this project's own preview hosts are honoured; anything
    // else silently falls back to production (never an error, so the allowlist
    // itself isn't discoverable).
    const ALLOWED_ORIGINS = new Set([
      "https://aura-intel.org",
      "https://www.aura-intel.org",
    ]);
    const PREVIEW_ORIGIN =
      /^https:\/\/[a-z0-9-]+--ebcdc7ac-e312-488b-8661-90ceb9c5c745\.lovable\.app$/;
    const requested = typeof origin === "string" ? origin.trim().replace(/\/+$/, "") : "";
    const safeOrigin =
      ALLOWED_ORIGINS.has(requested) || PREVIEW_ORIGIN.test(requested)
        ? requested
        : "https://aura-intel.org";
    if (requested && safeOrigin !== requested) {
      console.warn("send-password-reset: rejected origin, using production:", requested);
    }


    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
      options: { redirectTo: `${safeOrigin}/auth` },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.warn("generateLink:", linkError?.message);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetUrl = linkData.properties.action_link;

    let name = "there";
    try {
      const { data: profile } = await admin
        .from("diagnostic_profiles")
        .select("first_name")
        .eq("user_id", linkData.user!.id)
        .maybeSingle();
      if (profile?.first_name) name = profile.first_name;
    } catch (_) { /* ignore */ }
    const body = `
      ${heading("Reset your password")}
      ${paragraph(`Hi ${name}, we received a request to reset the password on your Aura account. Use the button below to set a new one.`)}
      ${note("The link expires in 24 hours. If you didn't ask for this, you can ignore this email.")}
    `;
    const html = renderEmail({
      preheader: "Reset your Aura password",
      body,
      cta: { href: resetUrl, label: "Set a new password" },
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
        to: [cleanEmail],
        reply_to: "mohammad.mahafdhah@aura-intel.org",
        subject: "Reset your Aura password",
        html,
        tags: [
          ...(linkData.user?.id ? [{ name: "user_id", value: linkData.user.id }] : []),
          { name: "email_type", value: "password_reset" },
        ],
      }),
    });
    if (!resendRes.ok) {
      const errorBody = await resendRes.text();
      console.error("send-password-reset Resend FAILED:", resendRes.status, errorBody);
      return new Response(
        JSON.stringify({ error: "Email delivery failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-password-reset CRITICAL:", err);
    return new Response(
      JSON.stringify({ error: "Password reset failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});