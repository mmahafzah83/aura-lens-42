import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  emailShell, heading, button, INK, INK_BODY, INK_MUTE, OXBLOOD, RULE, AMBER,
} from "../_shared/email-theme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Require a valid JWT and ensure caller owns the target email.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, email, first_name } = await req.json();
    if (!type || !email) {
      return new Response(JSON.stringify({ error: "type and email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerEmail = (userData.user.email || "").toLowerCase();
    const targetEmail = String(email).trim().toLowerCase();
    if (!callerEmail || callerEmail !== targetEmail) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = first_name || "there";
    let subject = "";
    let heading = "";
    let message = "";
    let warningBlock = "";
    let ctaBlock = "";

    if (type === "password_set") {
      subject = "Your Aura password is set";
      heading = "You're all set.";
      message = `Hi ${name}, your Aura password has been created. You can now log in anytime at aura-intel.org.`;
      ctaBlock = `<p style="margin:24px 0;">${button("https://aura-intel.org/auth", "Open Aura →")}</p>`;
    } else if (type === "password_changed") {
      subject = "Your Aura password was changed";
      heading = "Password updated.";
      message = `Hi ${name}, your Aura password was just changed. If this was you, no action is needed.`;
      warningBlock = `<p style="background:#FBF1DA;border:1px solid ${RULE};border-radius:8px;padding:12px 14px;font-size:13px;color:${OXBLOOD};margin:18px 0;"><strong style="color:${INK};">Heads up.</strong> If you didn't make this change, reset your password immediately at aura-intel.org/auth.</p>`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown notification type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bodyHtml = `
      ${headingHtml(heading)}
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:${INK_BODY};">${message}</p>
      ${warningBlock}
      ${ctaBlock}
    `;
    const html = emailShell({ preheader: subject, body: bodyHtml });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
        to: [email],
        reply_to: "mohammad.mahafdhah@aura-intel.org",
        subject,
        html,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-account-notification:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});