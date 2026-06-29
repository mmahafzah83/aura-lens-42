import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  emailShell, heading, button, AMBER, INK_MUTE, OXBLOOD,
} from "../_shared/email-theme.ts";

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

    const { email } = await req.json();
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

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
      options: { redirectTo: "https://aura-intel.org/auth" },
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
      <p style="font-size:15px;line-height:1.6;margin:0 0 18px;">Hi ${name}, we received a request to reset the password for your Aura account. Click below to set a new one.</p>
      <p style="margin:24px 0;">${button(resetUrl, "Reset my password →")}</p>
      <p style="font-size:13px;color:${INK_MUTE};margin:0 0 8px;">This link expires in 24 hours.</p>
      <p style="font-size:13px;color:${INK_MUTE};margin:0 0 18px;">If you didn't request this, you can safely ignore this email.</p>
      <p style="font-size:12px;color:${INK_MUTE};line-height:1.5;margin:18px 0 0;word-break:break-all;">If the button doesn't work, paste this link:<br/><a href="${resetUrl}" style="color:${OXBLOOD};">${resetUrl}</a></p>
    `;
    const html = emailShell({ preheader: "Reset your Aura password", body });

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