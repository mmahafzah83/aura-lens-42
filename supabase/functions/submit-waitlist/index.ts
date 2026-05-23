import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory IP rate limiter (per isolate). 60 minute window.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const last = ipHits.get(ip);
  if (last && now - last < RATE_WINDOW_MS) return false;
  ipHits.set(ip, now);
  // Opportunistic cleanup
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (now - v > RATE_WINDOW_MS) ipHits.delete(k);
    }
  }
  return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SENIORITY = [
  "C-Suite",
  "SVP / EVP",
  "VP",
  "Senior Director",
  "Director",
  "Senior Manager",
  "Manager",
  "Principal / Fellow",
  "Advisor / Board Member",
  "Other",
];
const ALLOWED_SECTOR = [
  "Consulting & Professional Services",
  "Energy & Utilities",
  "Water & Infrastructure",
  "Oil & Gas",
  "Finance & Banking",
  "Government & Public Sector",
  "Technology & IT",
  "Healthcare & Pharma",
  "Real Estate & Construction",
  "Telecom",
  "Education & Academia",
  "Manufacturing & Industrial",
  "Defense & Aerospace",
  "Retail & Consumer",
  "Transportation & Logistics",
  "Other",
];

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
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const seniority = typeof body.seniority === "string" ? body.seniority.trim() : "";
    const sector = typeof body.sector === "string" && body.sector.trim() ? body.sector.trim() : null;

    if (!name || name.length > 200) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!seniority || !ALLOWED_SENIORITY.includes(seniority)) {
      return new Response(JSON.stringify({ error: "Valid seniority is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (sector && !ALLOWED_SECTOR.includes(sector)) {
      return new Response(JSON.stringify({ error: "Invalid sector" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Duplicate check
    const { data: existing, error: dupErr } = await supabase
      .from("beta_allowlist")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (dupErr) {
      console.error("Duplicate check failed:", dupErr);
      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existing) {
      return new Response(
        JSON.stringify({ duplicate: true, message: "You're already on the list" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert
    const { error: insertErr } = await supabase.from("beta_allowlist").insert({
      name,
      email,
      seniority,
      sector,
      status: "pending",
      source: "waitlist",
    });

    if (insertErr) {
      console.error("Insert failed:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to submit" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send confirmation email via Supabase Auth admin generateLink + custom email is non-trivial.
    // Use simple approach: send via Resend if available, otherwise log and continue (do not fail submit).
    try {
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
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>You're on the list</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:${BODY_FONT};color:#ededed;-webkit-font-smoothing:antialiased;">
<div style="padding:32px 16px;background:#0d0d0d;">
  <div style="max-width:560px;margin:0 auto;background:#0d0d0d;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;">
    <div style="padding:36px 40px 0;">${eye(36, BRAND)}</div>
    <div style="padding:24px 40px 8px;">
      <h1 style="font-family:${HEADING_FONT};font-size:24px;font-weight:500;line-height:1.3;color:#ffffff;margin:0 0 22px;">${name}, you're on the list.</h1>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 16px;">We received your request.</p>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 16px;">Aura is in private beta with fewer than 50 professionals. I review every application personally — not an algorithm, not a form filter. Me.</p>
      <p style="font-size:15px;line-height:1.75;color:#ededed;margin:0 0 16px;">I'll look at your background this week. If Aura is right for you, you'll receive an invitation with everything you need to get started.</p>
      <p style="font-size:15px;line-height:1.75;color:#999;margin:16px 0 20px;">In the meantime — keep reading what matters to your sector. That's exactly what Aura will turn into presence.</p>
      <p style="font-size:15px;color:#ededed;font-weight:500;margin:20px 0 4px;">Mohammad Mahafzah</p>
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
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <invites@aura-intel.org>",
            to: [email],
            subject: `You're on the list, ${name}`,
            reply_to: "mohammad.mahafdhah@aura-intel.org",
            html,
          }),
        });
      } else {
        console.log(`[submit-waitlist] No RESEND_API_KEY set — skipping confirmation email for ${email}`);
      }
    } catch (mailErr) {
      console.error("Email send failed (non-fatal):", mailErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: "You're on the list" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("submit-waitlist error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});