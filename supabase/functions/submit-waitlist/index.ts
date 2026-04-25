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
const ALLOWED_SENIORITY = ["C-Suite", "VP", "Director", "Manager", "Other"];
const ALLOWED_SECTOR = ["Consulting", "Energy", "Finance", "Government", "Technology", "Other"];

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
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <onboarding@resend.dev>",
            to: [email],
            subject: "You're on the Aura waitlist",
            text: `Hi ${name}, you're on the list. We'll reach out to ${email} when your spot opens.\n\n— Mohammad, Aura`,
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