import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM = "Aura <Mohammad.Mahafdhah@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";
const BRAND = "#B08D3A";
const HEADING_FONT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildHtml(name: string) {
  const greeting = name ? escapeHtml(name) : "there";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a08;font-family:${BODY_FONT};color:#ededed;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:#0f0e0c;border:1px solid #1f1e1c;border-radius:12px;padding:36px 32px;">
    <div style="font-size:28px;color:${BRAND};line-height:1;margin-bottom:24px;">✦</div>
    <h1 style="font-family:${HEADING_FONT};font-weight:400;font-size:24px;color:#fff;margin:0 0 24px;line-height:1.3;">Update on your Aura application</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#cfcfcf;">${greeting},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#cfcfcf;">Thank you for your interest in Aura.</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#cfcfcf;">After reviewing your application, we've decided that Aura isn't the right fit for your profile at this stage. We're focused on a very specific cohort of professionals right now, and we want to make sure every user gets the most value from the platform.</p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#cfcfcf;">This isn't permanent. As Aura expands to new sectors and levels, we may reach out again.</p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #1f1e1c;">
      <div style="font-size:14px;color:#ededed;font-weight:500;">Mohammad Mahafzah</div>
      <div style="font-size:12px;color:#8a8478;margin-top:2px;">Aura builder</div>
    </div>
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").toString().trim().toLowerCase();
    const name = (body?.name || "").toString().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "valid email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const firstName = name ? name.split(/\s+/)[0] : "";
    const html = buildHtml(firstName);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject: "Update on your Aura application",
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("Resend decline failed", res.status, txt);
      return new Response(JSON.stringify({ error: txt }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-decline-email error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});