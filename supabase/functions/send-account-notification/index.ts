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
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { type, email, first_name } = await req.json();
    if (!type || !email) {
      return new Response(JSON.stringify({ error: "type and email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      ctaBlock = `<p style="margin:24px 0;"><a href="https://aura-intel.org/auth" style="display:inline-block;background:${BRAND};color:#1A1916;text-decoration:none;font-weight:600;font-size:14px;padding:13px 22px;border-radius:10px;">Open Aura →</a></p>`;
    } else if (type === "password_changed") {
      subject = "Your Aura password was changed";
      heading = "Password updated.";
      message = `Hi ${name}, your Aura password was just changed. If this was you, no action is needed.`;
      warningBlock = `<p style="background:#FFF4E5;border:1px solid #F5C97B;border-radius:8px;padding:12px 14px;font-size:13px;color:#7A4F0E;margin:18px 0;">If you didn't make this change, reset your password immediately at aura-intel.org/auth.</p>`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown notification type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F6F1E8;font-family:${BODY_FONT};color:#1A1916;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF8;border:1px solid #E8DFCC;border-radius:14px;padding:36px 36px 28px;">
        <tr><td align="left" style="padding-bottom:18px;">${horizonEye(36, BRAND)}</td></tr>
        <tr><td>
          <h1 style="font-family:${HEADING_FONT};font-size:28px;font-weight:500;line-height:1.2;margin:0 0 14px;color:#1A1916;">${heading}</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:#3A3633;">${message}</p>
          ${warningBlock}
          ${ctaBlock}
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

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Aura <invites@aura-intel.org>",
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});