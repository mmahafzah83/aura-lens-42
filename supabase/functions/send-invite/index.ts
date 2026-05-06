import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const REDIRECT_URL = "https://aura-intel.org/auth";

// Horizon Eye mark — inline SVG, bronze stroke. Renders consistently across email clients.
const horizonEye = (size = 40, color = "#B08D3A") => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" aria-label="Aura">
  <path d="M8 40 C 22 22, 58 22, 72 40 C 58 58, 22 58, 8 40 Z" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="40" cy="40" r="11" stroke="${color}" stroke-width="2" fill="none"/>
  <circle cx="40" cy="40" r="4" fill="${color}"/>
  <line x1="40" y1="6" x2="40" y2="14" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="40" y1="66" x2="40" y2="74" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6" y1="40" x2="14" y2="40" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="66" y1="40" x2="74" y2="40" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const buildEmailHtml = (BRAND: string) => {
  const HEADING_FONT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const BODY_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Aura access is ready</title>
</head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:${BODY_FONT};color:#1c1812;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;">Your Aura access is ready. One capture starts your signal graph.</div>
<div style="padding:32px 16px;background:#f5f1e8;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <div style="padding:36px 40px 0;text-align:left;">
      ${horizonEye(40, BRAND)}
    </div>
    <div style="padding:24px 40px 40px;">
      <h1 style="font-family:${HEADING_FONT};font-size:30px;line-height:1.2;font-weight:500;color:#1c1812;margin:0 0 24px;">Your Aura access is ready, {{NAME}}</h1>
      <p style="font-size:15px;line-height:1.7;color:#3a3530;margin:0 0 18px;">You've been selected for Aura's private beta — strategic intelligence for senior professionals who convert expertise into market authority.</p>
      {{INVITER_NOTE_BLOCK}}
      <p style="font-size:15px;line-height:1.7;color:#3a3530;margin:0 0 32px;">Your access is waiting. One capture starts your signal graph. One signal reshapes how the market sees you.</p>
      <div style="margin:0 0 36px;">
        <a href="{{CONFIRMATION_URL}}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:0 28px;height:44px;line-height:44px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;font-family:${BODY_FONT};">Accept your invitation →</a>
      </div>
      <p style="font-size:12px;color:#8a8478;line-height:1.6;margin:0 0 8px;word-break:break-all;">If the button doesn't work, paste this link:<br><a href="{{CONFIRMATION_URL}}" style="color:${BRAND};">{{CONFIRMATION_URL}}</a></p>
    </div>
    <div style="padding:24px 40px;border-top:1px solid #efeae0;display:flex;align-items:center;gap:12px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px;">${horizonEye(24, BRAND)}</td>
        <td style="vertical-align:middle;font-size:12px;color:#6b665c;font-family:${BODY_FONT};">Aura · Strategic Intelligence · <a href="https://aura-intel.org" style="color:#6b665c;text-decoration:none;">aura-intel.org</a></td>
      </tr></table>
    </div>
  </div>
</div>
</body>
</html>`;
};

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
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;
    if (callerId !== ADMIN_USER_ID) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "there";
    const inviterNote = typeof body.inviter_note === "string" ? body.inviter_note.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch active design system tokens for brand colors / fonts
    const { data: dsRow } = await admin
      .from('design_system')
      .select('tokens')
      .eq('scope', 'global')
      .eq('is_active', true)
      .single();
    const ds = (dsRow?.tokens as any) || {};
    const BRAND = ds?.colors?.brand?.light || '#B08D3A';

    // Try invite first; if user already exists, fall back to magiclink so
    // the branded email still goes out with a working sign-in link.
    let linkRes = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: REDIRECT_URL },
    });

    if (
      linkRes.error &&
      ((linkRes.error as any).code === "email_exists" ||
        /already been registered/i.test(linkRes.error.message))
    ) {
      console.log(`User ${email} already exists — falling back to magiclink`);
      linkRes = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: REDIRECT_URL },
      });
    }

    if (linkRes.error || !linkRes.data?.properties?.action_link) {
      console.error("generateLink failed:", linkRes.error);
      return new Response(
        JSON.stringify({ error: linkRes.error?.message || "Failed to generate invite link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const confirmationUrl = linkRes.data.properties.action_link;

    // Escape inviter note to prevent HTML injection
    const escapeHtml = (s: string) => s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const inviterNoteBlock = inviterNote
      ? `<div style="margin:0 0 24px;padding:16px 18px;background:#faf6ec;border-left:3px solid ${BRAND};border-radius:4px;font-size:14px;line-height:1.7;color:#3a3530;font-style:italic;">${escapeHtml(inviterNote)}</div>`
      : "";

    // Build email HTML
    const html = buildEmailHtml(BRAND)
      .replace(/{{NAME}}/g, escapeHtml(name))
      .replace(/{{CONFIRMATION_URL}}/g, confirmationUrl)
      .replace(/{{INVITER_NOTE_BLOCK}}/g, inviterNoteBlock)
      .replace(/{{EMAIL}}/g, email);

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Aura <invites@aura-intel.org>",
        to: [email],
        subject: `Your Aura access is ready, ${name}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend send failed:", resendRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Failed to send email: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update beta_allowlist
    const { error: updateErr } = await admin
      .from("beta_allowlist")
      .update({
        status: "invited",
        invited_at: new Date().toISOString(),
        invited_by: callerId,
      })
      .eq("email", email);

    if (updateErr) {
      console.error("Allowlist update failed:", updateErr);
      // Email already sent — log but still return success
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
