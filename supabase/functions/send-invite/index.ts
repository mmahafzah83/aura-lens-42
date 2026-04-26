import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const REDIRECT_URL = "https://www.aura-intel.org/auth";

const EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Your Aura access is ready</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background-color: #f0ede8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  img { border: 0; display: block; }
  a { text-decoration: none; }
  @media only screen and (max-width: 600px) {
    .email-wrapper { padding: 0 !important; }
    .email-card { border-radius: 0 !important; }
    .content-pad { padding: 32px 24px !important; }
    .hero-pad { padding: 40px 24px 36px !important; }
    .feature-row { display: block !important; }
    .feature-cell { display: block !important; width: 100% !important; padding-bottom: 12px !important; }
    .proof-cell { display: block !important; width: 33% !important; }
    .footer-pad { padding: 28px 24px !important; }
    .cta-btn { padding: 16px 28px !important; font-size: 15px !important; }
  }
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;">Your Aura beta access is approved. Here's everything you need to get started — and why it matters.</div>

<div class="email-wrapper" style="padding:24px;background-color:#f0ede8;">
  <div class="email-card" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">

    <div class="hero-pad" style="padding:48px 40px 40px;background:linear-gradient(135deg,#0d0d0d,#1a1a1a);color:#f0f0f0;">
      <p style="font-size:13px;color:#F97316;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:16px;">⚡ Aura · Strategic Intelligence</p>
      <h1 style="font-size:32px;line-height:1.2;font-weight:700;color:#f0f0f0;margin-bottom:16px;">You're in. Welcome to Aura.</h1>
      <p style="font-size:16px;color:#aaa;line-height:1.5;">Your expertise has always been there.<br>Now it starts working for you.</p>
    </div>

    <div class="content-pad" style="padding:40px;color:#1a1a1a;">
      <p style="font-size:16px;line-height:1.6;margin-bottom:18px;">Hi {{NAME}},</p>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:18px;">I reviewed your request personally, and I'm glad to have you in the beta. You're among fewer than 50 people with access right now — each one a senior professional who I believe will get genuine value from what Aura does.</p>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:32px;">Here's what to expect, and how to get the most out of your first session.</p>

      <h2 style="font-size:20px;font-weight:700;color:#0d0d0d;margin-bottom:14px;">What Aura actually does</h2>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:14px;">Most senior professionals carry far more expertise than their market ever sees. It disappears into meetings, emails, and the day-to-day. Years of knowledge — invisible to the people who should be hiring you, promoting you, or following your thinking.</p>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:24px;">Aura changes that — quietly, continuously, without adding anything to your week. It works in three layers:</p>

      <div style="margin-bottom:14px;padding:18px;background:#faf8f4;border-radius:8px;border-left:3px solid #F97316;">
        <p style="font-size:15px;font-weight:600;color:#0d0d0d;margin-bottom:6px;">📡 Signal intelligence</p>
        <p style="font-size:14px;line-height:1.6;color:#555;">Captures what you already read — articles, reports, LinkedIn posts — and extracts strategic market signals ranked by confidence and relevance to your exact sector.</p>
      </div>
      <div style="margin-bottom:14px;padding:18px;background:#faf8f4;border-radius:8px;border-left:3px solid #F97316;">
        <p style="font-size:15px;font-weight:600;color:#0d0d0d;margin-bottom:6px;">✍️ Flash content</p>
        <p style="font-size:14px;line-height:1.6;color:#555;">Turns those signals into LinkedIn posts — English or Arabic — in your voice, in under 5 minutes. No blank page. No ghostwriter. Your perspective, amplified.</p>
      </div>
      <div style="margin-bottom:32px;padding:18px;background:#faf8f4;border-radius:8px;border-left:3px solid #F97316;">
        <p style="font-size:15px;font-weight:600;color:#0d0d0d;margin-bottom:6px;">📈 Authority score — the compounding layer</p>
        <p style="font-size:14px;line-height:1.6;color:#555;">Tracks your market visibility over time. Every signal captured, every post published adds to your score. The system learns your voice, your patterns, your sector — and gets sharper the more you use it.</p>
      </div>

      <table role="presentation" width="100%" style="margin-bottom:36px;border-collapse:collapse;">
        <tr class="feature-row">
          <td class="proof-cell" style="text-align:center;padding:16px;background:#0d0d0d;border-radius:8px 0 0 8px;color:#fff;">
            <div style="font-size:24px;font-weight:700;color:#F97316;">3×</div>
            <div style="font-size:12px;color:#aaa;margin-top:4px;">Average reach lift<br>in 60 days</div>
          </td>
          <td class="proof-cell" style="text-align:center;padding:16px;background:#1a1a1a;color:#fff;">
            <div style="font-size:24px;font-weight:700;color:#F97316;">&lt;5 min</div>
            <div style="font-size:12px;color:#aaa;margin-top:4px;">Per post via<br>Flash mode</div>
          </td>
          <td class="proof-cell" style="text-align:center;padding:16px;background:#0d0d0d;border-radius:0 8px 8px 0;color:#fff;">
            <div style="font-size:24px;font-weight:700;color:#F97316;">100%</div>
            <div style="font-size:12px;color:#aaa;margin-top:4px;">Your voice,<br>your expertise</div>
          </td>
        </tr>
      </table>

      <h2 style="font-size:20px;font-weight:700;color:#0d0d0d;margin-bottom:10px;">Your activation link</h2>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:6px;"><strong>Ready when you are.</strong></p>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:24px;">Click below to set your password and step into your intelligence OS. Your first briefing is waiting.</p>

      <div style="text-align:center;margin-bottom:14px;">
        <a href="{{CONFIRMATION_URL}}" class="cta-btn" style="display:inline-block;background:#F97316;color:#0d0d0d;padding:18px 36px;border-radius:8px;font-weight:700;font-size:16px;">Activate my Aura account →</a>
      </div>
      <p style="font-size:12px;color:#888;text-align:center;margin-bottom:18px;">This link expires in 48 hours and can only be used once.</p>
      <p style="font-size:12px;color:#888;line-height:1.6;margin-bottom:32px;word-break:break-all;">If the button doesn't work, copy this link:<br><a href="{{CONFIRMATION_URL}}" style="color:#F97316;">{{CONFIRMATION_URL}}</a></p>

      <h2 style="font-size:20px;font-weight:700;color:#0d0d0d;margin-bottom:14px;">Your first 10 minutes</h2>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:18px;">The onboarding checklist inside Aura will guide you step by step. Here's the sequence that unlocks everything:</p>

      <div style="margin-bottom:12px;"><strong style="color:#F97316;">1.</strong> <strong style="color:#0d0d0d;">Activate your account</strong> — <span style="color:#555;font-size:14px;">Click the button above. Set your password. You're in — takes under a minute.</span></div>
      <div style="margin-bottom:12px;"><strong style="color:#F97316;">2.</strong> <strong style="color:#0d0d0d;">Build your story — 5 minutes</strong> — <span style="color:#555;font-size:14px;">Answer 5 questions about your expertise, sector, and positioning. This trains your personal voice engine — every post Aura generates will sound unmistakably like you.</span></div>
      <div style="margin-bottom:12px;"><strong style="color:#F97316;">3.</strong> <strong style="color:#0d0d0d;">Capture your first source</strong> — <span style="color:#555;font-size:14px;">Paste any article URL or drop a document into the Capture tab. Aura reads it, extracts the signals, and stores them in your intelligence layer. No manual tagging. No effort.</span></div>
      <div style="margin-bottom:32px;"><strong style="color:#F97316;">4.</strong> <strong style="color:#0d0d0d;">Generate your first post</strong> — <span style="color:#555;font-size:14px;">Go to Publish → Flash. Pick a signal. Hit generate. Your first post — in your voice, from your intelligence — is ready in under 5 minutes.</span></div>

      <div style="background:#faf8f4;padding:24px;border-radius:8px;margin-bottom:32px;border-left:3px solid #0d0d0d;">
        <p style="font-size:13px;font-weight:600;color:#0d0d0d;margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">A note from Mohammad</p>
        <p style="font-size:14px;line-height:1.7;color:#333;font-style:italic;">"I built Aura because I saw brilliant senior professionals whose expertise never reached the market — not because they lacked ideas, but because they lacked the system to turn ideas into visibility. Aura is that system. I genuinely hope it changes the way your work is seen."</p>
      </div>

      <p style="font-size:14px;line-height:1.7;color:#555;margin-bottom:18px;">Questions, feedback, or anything at all — just reply to this email. It comes directly to me. I read every message.</p>
      <p style="font-size:15px;line-height:1.7;color:#333;">Welcome to the beta.<br><br><strong style="color:#0d0d0d;">Mohammad Mahafzah</strong><br><span style="color:#888;font-size:13px;">Director, Digital Transformation · EY GCC</span></p>
    </div>

    <div class="footer-pad" style="padding:32px 40px;background:#0d0d0d;color:#888;">
      <p style="font-size:13px;color:#F97316;font-weight:700;margin-bottom:6px;">Aura</p>
      <p style="font-size:12px;line-height:1.6;color:#888;margin-bottom:14px;">Strategic Intelligence OS · Closed Beta<br>Riyadh, Saudi Arabia</p>
      <p style="font-size:11px;color:#666;line-height:1.6;">You received this because you requested early access to Aura.<br>This invitation was sent to {{EMAIL}} and is non-transferable.</p>
    </div>

  </div>
</div>
</body>
</html>`;

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

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Generate invite link without sending Supabase's default email
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: REDIRECT_URL },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink failed:", linkErr);
      return new Response(
        JSON.stringify({ error: linkErr?.message || "Failed to generate invite link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const confirmationUrl = linkData.properties.action_link;

    // Build email HTML
    const html = EMAIL_HTML
      .replace(/{{NAME}}/g, name)
      .replace(/{{CONFIRMATION_URL}}/g, confirmationUrl)
      .replace(/{{EMAIL}}/g, email);

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Mohammad at Aura <invites@aura-intel.org>",
        to: [email],
        subject: "You're in — your Aura access is ready",
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
