import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_INVITES = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;
    const callerEmail = userData.user.email || "";
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "invite";

    // Always compute remaining
    const { count: usedCount } = await admin
      .from("beta_allowlist")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", callerId);
    const used = usedCount || 0;
    const remaining = Math.max(0, MAX_INVITES - used);

    if (action === "count") {
      return new Response(JSON.stringify({ used, remaining, max: MAX_INVITES }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "invite"
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Please enter a valid email." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: "You've used all 3 invitations." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing entry
    const { data: existing } = await admin
      .from("beta_allowlist")
      .select("id, status, invited_by")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "This email is already on the list." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertErr } = await admin.from("beta_allowlist").insert({
      email,
      status: "pending",
      source: "colleague_invite",
      personal_note: note || null,
      invited_by: callerId,
      requested_at: new Date().toISOString(),
    });

    if (insertErr) {
      console.error("[colleague-invite] insert failed", insertErr);
      return new Response(JSON.stringify({ error: "Could not record invitation." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up inviter's first name (best-effort)
    let inviterName = "";
    try {
      const { data: inviterProfile } = await admin
        .from("diagnostic_profiles")
        .select("first_name")
        .eq("user_id", callerId)
        .maybeSingle();
      inviterName = (inviterProfile as any)?.first_name || "";
    } catch (_) { /* fallback below */ }
    if (!inviterName && callerEmail) {
      inviterName = callerEmail.split("@")[0] || "";
    }

    // Best-effort emails via Resend (do not block success)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const BRAND = "#B08D3A";
      const HEADING_FONT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
      const BODY_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif";
      const eye = (size: number, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" aria-label="Aura">
  <path d="M8 40 C 22 22, 58 22, 72 40 C 58 58, 22 58, 8 40 Z" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="40" cy="40" r="11" stroke="${color}" stroke-width="2" fill="none"/>
  <circle cx="40" cy="40" r="4" fill="${color}"/>
</svg>`;
      const displayInviter = inviterName || "A colleague";
      const noteBlock = note
        ? `<blockquote style="margin:18px 0 22px;padding:14px 18px;border-left:2px solid #333;font-style:italic;color:#bbb;font-size:14px;line-height:1.75;">${displayInviter} added: "${note.replace(/</g, "&lt;")}"</blockquote>`
        : "";
      const referralHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${displayInviter} thinks you should see this</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:${BODY_FONT};color:#ededed;-webkit-font-smoothing:antialiased;">
<div style="padding:32px 16px;background:#0d0d0d;">
  <div style="max-width:560px;margin:0 auto;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;">
    <div style="padding:36px 40px 0;">${eye(36, BRAND)}</div>
    <div style="padding:24px 40px 8px;">
      <h1 style="font-family:${HEADING_FONT};font-size:24px;font-weight:500;line-height:1.3;color:#ffffff;margin:0 0 22px;">Someone in your circle thinks your expertise deserves more visibility.</h1>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 16px;">${displayInviter} referred you to Aura — a personal intelligence system for senior professionals.</p>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 22px;">Aura reads what you already read, finds the strategic patterns in your sector, and writes content in your voice. Not templates. Not generic AI. Your real expertise, made visible to the right people.</p>
      <p style="font-size:10px;letter-spacing:2px;color:${BRAND};font-weight:600;margin:0 0 12px;">WHAT HAPPENS NEXT</p>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 22px;">I'll review your profile this week. If Aura is right for you, you'll receive a personal invitation from me — with everything you need to get started in 10 minutes.</p>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 8px;">In the meantime, see what Aura is about:</p>
      <p style="font-size:15px;line-height:1.75;margin:0 0 8px;"><a href="https://aura-introduction1.netlify.app/" style="color:${BRAND};text-decoration:none;font-weight:500;">Explore Aura →</a></p>
      ${noteBlock}
      <p style="font-size:15px;color:#ededed;font-weight:500;margin:24px 0 4px;">Mohammad Mahafzah</p>
      <p style="font-size:13px;color:#666;margin:0 0 24px;">Aura builder</p>
    </div>
    <div style="padding:16px 40px 28px;border-top:1px solid #1f1f1f;margin-top:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:10px;">${eye(16, "#555")}</td>
        <td valign="middle" style="font-size:11px;letter-spacing:1px;color:#555;">Aura · Strategic Intelligence · aura-intel.org</td>
      </tr></table>
    </div>
  </div>
</div>
</body></html>`;

      // 1. Referral email to invited person
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <invites@aura-intel.org>",
            to: [email],
            subject: `${displayInviter} thinks you should see this`,
            reply_to: "mohammad.mahafdhah@aura-intel.org",
            html: referralHtml,
          }),
        });
      } catch (e) {
        console.warn("[colleague-invite] referral email failed (non-fatal)", e);
      }

      // 2. Admin notification (existing)
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <invites@aura-intel.org>",
            to: ["mohammad.mahafdhah@aura-intel.org"],
            subject: `New colleague invite: ${email}`,
            html: `<p><strong>${callerEmail}</strong> (${inviterName || "unknown name"}) invited <strong>${email}</strong> to the Aura beta.</p>${note ? `<p>Note: "${note}"</p>` : ""}<p>A referral email has been sent to ${email}.</p>`,
          }),
        });
      } catch (e) {
        console.warn("[colleague-invite] notify admin failed", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, remaining: remaining - 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[colleague-invite] error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});