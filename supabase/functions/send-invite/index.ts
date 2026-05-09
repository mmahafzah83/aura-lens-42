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
  const CTA = "#F97316";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your expertise deserves to be seen</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:${BODY_FONT};color:#ededed;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;">Aura is ready for you. Private beta — fewer than 50 people.</div>
<div style="padding:32px 16px;background:#0d0d0d;">
  <div style="max-width:580px;margin:0 auto;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;">

    <!-- HERO -->
    <div style="padding:36px 40px 0;text-align:left;">${horizonEye(40, BRAND)}</div>
    <div style="padding:24px 40px 8px;">
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 18px;">{{GREETING}}</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 18px;">I've been building something for people like you.</p>
      <p style="font-size:15px;line-height:1.7;color:#bdbdbd;margin:0 0 18px;">Senior professionals who've spent years becoming exceptional at what they do — but whose expertise is invisible outside their direct network.</p>
      <p style="font-size:15px;line-height:1.9;color:#ededed;margin:0 0 18px;">You read more in a week than most people read in a month.<br>You see patterns others miss.<br>You hold opinions that executives pay to hear.</p>
      <p style="font-size:15px;line-height:1.7;color:#bdbdbd;margin:0 0 18px;">But the market doesn't know that yet.</p>
      <p style="font-family:${HEADING_FONT};font-size:24px;line-height:1.3;color:#ffffff;margin:8px 0 24px;">Aura changes that.</p>
      {{INVITER_NOTE_BLOCK}}
    </div>

    <hr style="border:0;border-top:1px solid #1f1f1f;margin:8px 40px;">

    <!-- WHAT AURA DOES -->
    <div style="padding:24px 40px 8px;">
      <p style="font-size:11px;letter-spacing:2px;color:${BRAND};margin:0 0 16px;font-weight:600;">WHAT AURA DOES</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 18px;">Aura reads what you read — articles, reports, posts — and detects the strategic patterns hidden in your knowledge consumption.</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 18px;">Then it turns those patterns into authority.</p>
      <p style="font-size:15px;line-height:1.9;color:#bdbdbd;margin:0 0 18px;">Content that sounds like you, not like AI.<br>Positioning that's backed by evidence, not self-declaration.<br>A score that compounds the more you use it.</p>
      <p style="font-size:15px;line-height:1.7;color:#bdbdbd;margin:0 0 24px;">You don't need to learn a new skill or add hours to your week. You just keep doing what you already do — and Aura makes it visible.</p>
    </div>

    <hr style="border:0;border-top:1px solid #1f1f1f;margin:8px 40px;">

    <!-- YOUR ACCESS -->
    <div style="padding:24px 40px 8px;">
      <p style="font-size:11px;letter-spacing:2px;color:${BRAND};margin:0 0 16px;font-weight:600;">YOUR ACCESS</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 18px;">You're one of fewer than 50 people in the private beta. I reviewed your request personally.</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 14px;">Two things before you click:</p>
      <p style="font-size:14px;line-height:1.7;color:#bdbdbd;margin:0 0 12px;">⏱&nbsp;&nbsp;This link expires in <strong style="color:#ededed;">48 hours</strong>. Click when you have 10 quiet minutes — it's worth your full attention.</p>
      <p style="font-size:14px;line-height:1.7;color:#bdbdbd;margin:0 0 28px;">🔐&nbsp;&nbsp;You'll be logged in automatically. Once inside, tap your avatar (top right) → <strong style="color:#ededed;">set a password</strong> so you can return anytime.</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 18px;">Click below to give your expertise the visibility it deserves.</p>
      <div style="margin:0 0 28px;">
        <a href="{{CONFIRMATION_URL}}" style="display:inline-block;background:${CTA};color:#ffffff;padding:0 28px;height:48px;line-height:48px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;font-family:${BODY_FONT};">Open my Aura →</a>
      </div>
    </div>

    <!-- FIRST 10 MINUTES (lighter section) -->
    <div style="background:#1a1a1a;padding:28px 40px;border-top:1px solid #1f1f1f;border-bottom:1px solid #1f1f1f;">
      <p style="font-size:11px;letter-spacing:2px;color:${BRAND};margin:0 0 16px;font-weight:600;">YOUR FIRST 10 MINUTES</p>
      <p style="font-size:15px;line-height:1.7;color:#ededed;margin:0 0 22px;">You'll feel the difference immediately.</p>

      <p style="font-size:14px;line-height:1.7;color:#ededed;margin:0 0 4px;"><strong>1 · Tell Aura who you are</strong></p>
      <p style="font-size:14px;line-height:1.7;color:#bdbdbd;margin:0 0 4px;">Complete your profile. This shapes every signal Aura detects and every post it writes.</p>
      <p style="font-size:12px;color:#8a8a8a;margin:0 0 18px;">(2 minutes)</p>

      <p style="font-size:14px;line-height:1.7;color:#ededed;margin:0 0 4px;"><strong>2 · Feed it one article</strong></p>
      <p style="font-size:14px;line-height:1.7;color:#bdbdbd;margin:0 0 4px;">Paste a URL of something you read this week. An industry report. A competitor's post. Anything from your world.</p>
      <p style="font-size:12px;color:#8a8a8a;margin:0 0 18px;">(1 minute)</p>

      <p style="font-size:14px;line-height:1.7;color:#ededed;margin:0 0 4px;"><strong>3 · Watch intelligence emerge</strong></p>
      <p style="font-size:14px;line-height:1.7;color:#bdbdbd;margin:0 0 18px;">Aura extracts strategic insights and starts building your signal map. After 3-5 articles, your first signal appears — and that's the moment everything clicks.</p>

      <p style="font-size:14px;line-height:1.7;color:#ededed;margin:0 0 4px;"><strong>4 · See yourself through the market's eyes</strong></p>
      <p style="font-size:14px;line-height:1.7;color:#bdbdbd;margin:0 0 8px;">Complete the brand assessment and Aura generates your Market Mirror — three perspectives on how headhunters, clients, and conference curators would describe you today.</p>
      <p style="font-size:14px;line-height:1.7;color:#ededed;font-style:italic;margin:0;">This is usually the moment people message me to say "how does it know this?"</p>
    </div>

    <!-- FOOTER -->
    <div style="padding:24px 40px;">
      <p style="font-size:12px;color:#8a8a8a;line-height:1.6;margin:0 0 16px;word-break:break-all;">If the button doesn't work, paste this link:<br><a href="{{CONFIRMATION_URL}}" style="color:${BRAND};">{{CONFIRMATION_URL}}</a></p>
      <p style="font-size:13px;line-height:1.7;color:#bdbdbd;margin:0 0 18px;">Questions or feedback — reply directly. This email reaches me, not a support queue.</p>
      <p style="font-size:14px;line-height:1.6;color:#ededed;margin:0;">Mohammad Mahafzah<br><span style="color:#8a8a8a;">Building Aura · <a href="https://aura-intel.org" style="color:#8a8a8a;text-decoration:none;">aura-intel.org</a></span></p>
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
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    const firstName = rawName ? rawName.split(/\s+/)[0] : "";
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
      ? `<div style="margin:8px 0 18px;padding:14px 16px;background:#1a1a1a;border-left:3px solid ${BRAND};border-radius:4px;font-size:14px;line-height:1.7;color:#bdbdbd;font-style:italic;">${escapeHtml(inviterNote)}</div>`
      : "";

    // Build email HTML
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
    const html = buildEmailHtml(BRAND)
      .replace(/{{GREETING}}/g, greeting)
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
        subject: "Your expertise deserves to be seen",
        reply_to: "mohammad.mahafdhah@aura-intel.org",
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
