import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEADING_FONT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif";

function horizonEye(size: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" style="display:block">
    <ellipse cx="32" cy="32" rx="28" ry="14" stroke="${color}" stroke-width="2" fill="none"/>
    <circle cx="32" cy="32" r="7" fill="${color}"/>
    <circle cx="32" cy="32" r="2.5" fill="#1A1916"/>
  </svg>`;
}

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

    let BRAND = "#B08D3A";
    try {
      const { data: dsRow } = await admin
        .from("design_system")
        .select("tokens")
        .eq("is_active", true)
        .maybeSingle();
      const c = (dsRow?.tokens as any)?.colors?.brand?.light;
      if (typeof c === "string") BRAND = c;
    } catch (_) { /* ignore */ }

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F6F1E8;font-family:${BODY_FONT};color:#1A1916;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF8;border:1px solid #E8DFCC;border-radius:14px;padding:36px 36px 28px;">
        <tr><td align="left" style="padding-bottom:18px;">${horizonEye(36, BRAND)}</td></tr>
        <tr><td>
          <h1 style="font-family:${HEADING_FONT};font-size:28px;font-weight:500;line-height:1.2;margin:0 0 14px;color:#1A1916;">Reset your password</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#3A3633;">Hi ${name}, we received a request to reset the password for your Aura account. Click below to set a new one.</p>
          <p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:${BRAND};color:#1A1916;text-decoration:none;font-weight:600;font-size:14px;padding:13px 22px;border-radius:10px;">Reset my password →</a></p>
          <p style="font-size:13px;color:#6B6866;margin:0 0 8px;">This link expires in 1 hour.</p>
          <p style="font-size:13px;color:#6B6866;margin:0 0 18px;">If you didn't request this, you can safely ignore this email.</p>
          <p style="font-size:12px;color:#8A8580;line-height:1.5;margin:18px 0 0;word-break:break-all;">If the button doesn't work, paste this link:<br/><a href="${resetUrl}" style="color:${BRAND};">${resetUrl}</a></p>
        </td></tr>
        <tr><td style="border-top:1px solid #EDE6D5;padding-top:18px;margin-top:24px;">
          <p style="font-size:11px;color:#8A8580;margin:18px 0 0;display:flex;align-items:center;gap:8px;">
            ${horizonEye(16, BRAND)}<span style="margin-left:8px;">Aura · Strategic Intelligence · aura-intel.org</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Aura <invites@aura-intel.org>",
        to: [cleanEmail],
        reply_to: "mohammad.mahafdhah@aura-intel.org",
        subject: "Reset your Aura password",
        html,
      }),
    });
    if (!resendRes.ok) {
      const errorBody = await resendRes.text();
      console.error("send-password-reset Resend FAILED:", resendRes.status, errorBody);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-password-reset CRITICAL:", err);
    // Still return success to user (don't reveal if email exists)
    // But log the actual error so admin can debug
    return new Response(JSON.stringify({
      success: true,
      _debug: Deno.env.get("DEBUG_MODE") === "true" ? (err as Error).message : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});