import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://aura-intel.org";
const FROM = "Mohammad Mahafzah <mohammad@aura-intel.org>";
const REPLY_TO = "mohammad@aura-intel.org";

type EmailType = "welcome" | "day1" | "day3" | "day7" | "inactive";

function shell(BRAND: string, FONT: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f4f0;font-family:'${FONT}',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1a1a1a;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="background:#ffffff;border-radius:10px;padding:32px 28px;line-height:1.6;font-size:15px;color:#1a1a1a;">
    ${body}
  </div>
  <p style="font-size:12px;color:#888;text-align:center;margin-top:18px;">Aura · Strategic Intelligence · <a href="${APP_URL}" style="color:#888;">aura-intel.org</a></p>
</div></body></html>`;
}

function ctaButton(BRAND: string, label: string, href: string) {
  return `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;padding:12px 22px;background:${BRAND};color:#0d0d0d;font-weight:600;border-radius:8px;text-decoration:none;font-size:14px;">${label}</a></p>`;
}

function signoff() {
  return `<p style="margin-top:24px;color:#444;">— Mohammad,<br/>Director of Digital Transformation, EY GCC</p>`;
}

function buildEmail(
  type: EmailType,
  ctx: {
    BRAND: string;
    FONT: string;
    firstName: string;
    sectorFocus: string | null;
    entriesCount: number;
    topSignals: { signal_title: string; confidence: number }[];
    score: number | null;
    tier: string | null;
    signalCount: number;
  }
): { subject: string; html: string } {
  const { BRAND, FONT, firstName, entriesCount, topSignals, score, tier, signalCount } = ctx;
  const name = firstName || "there";

  if (type === "welcome") {
    const subject = `Welcome to Aura, ${name} — here's your first 5 minutes`;
    const body = `
      <p>Hi ${name},</p>
      <p>Aura is ready. Three steps to your first signal:</p>
      <ol style="padding-left:20px;color:#333;">
        <li>Capture one article you'd normally read.</li>
        <li>Wait 60 seconds — Aura extracts the strategic signal.</li>
        <li>Open Intelligence to see what changed.</li>
      </ol>
      <p>That's the loop. Five minutes today is enough to start compounding.</p>
      ${ctaButton(BRAND, "Open Aura", APP_URL)}
      ${signoff()}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day1") {
    const subject = "Did Aura find your first signal?";
    const body = entriesCount < 3
      ? `<p>Hi ${name},</p><p>Aura needs a few captures to start surfacing signals. Drop in one article — anything you read this morning works.</p>${ctaButton(BRAND, "Capture now", APP_URL)}${signoff()}`
      : `<p>Hi ${name},</p><p>Nice — ${entriesCount} captures in. Aura should be surfacing your first signals. Take 30 seconds to look.</p>${ctaButton(BRAND, "See Intelligence", APP_URL)}${signoff()}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day3") {
    const subject = `Your intelligence is building, ${name}`;
    const top = topSignals[0];
    const body = top
      ? `<p>Hi ${name},</p><p>Top signal so far: <strong>"${top.signal_title}"</strong> (${Math.round(top.confidence * 100)}% confidence).</p><p>That's a publishable angle. Want to draft on it?</p>${ctaButton(BRAND, "Draft a post", APP_URL)}${signoff()}`
      : `<p>Hi ${name},</p><p>Aura hasn't found enough patterns yet — a few more captures unlocks signal detection. Aim for five total.</p>${ctaButton(BRAND, "Capture more", APP_URL)}${signoff()}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day7") {
    const subject = "One week with Aura — your progress";
    const body = `
      <p>Hi ${name},</p>
      <p>Seven days in. Here's where you stand:</p>
      <ul style="padding-left:20px;color:#333;">
        <li>Authority score: <strong>${score ?? 0}</strong>${tier ? ` · ${tier}` : ""}</li>
        <li>Signals detected: <strong>${signalCount}</strong></li>
        <li>Captures: <strong>${entriesCount}</strong></li>
      </ul>
      <p>${entriesCount > 10 ? "You're past the inflection point — the system is now learning your sector." : "Keep going. The compounding starts around capture 10."}</p>
      <p>Reply with one word: what's working, what isn't?</p>
      ${ctaButton(BRAND, "Open Aura", APP_URL)}
      ${signoff()}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  // inactive
  const subject = `Your authority score is slipping, ${name}`;
  const body = `<p>Hi ${name},</p><p>No captures in five days — your authority score drifts when Aura goes quiet. One capture reverses it.</p>${ctaButton(BRAND, "Capture one thing", APP_URL)}${signoff()}`;
  return { subject, html: shell(BRAND, FONT, body) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, email_type } = await req.json();
    if (!user_id || !email_type) {
      return new Response(JSON.stringify({ error: "user_id and email_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const types: EmailType[] = ["welcome", "day1", "day3", "day7", "inactive"];
    if (!types.includes(email_type)) {
      return new Response(JSON.stringify({ error: "invalid email_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // De-dupe
    const { data: existing } = await admin
      .from("lifecycle_emails")
      .select("id")
      .eq("user_id", user_id)
      .eq("email_type", email_type)
      .limit(1);
    if (existing && existing.length > 0 && email_type !== "inactive") {
      return new Response(JSON.stringify({ skipped: "already_sent" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recipient email
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(user_id);
    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipient = userData.user.email;

    // Profile
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("first_name, sector_focus")
      .eq("user_id", user_id)
      .maybeSingle();

    // Entries count
    const { count: entriesCount } = await admin
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id);

    // Signals
    const { data: signals, count: signalCount } = await admin
      .from("strategic_signals")
      .select("signal_title, confidence", { count: "exact" })
      .eq("user_id", user_id)
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(3);

    // Latest score
    const { data: snap } = await admin
      .from("score_snapshots")
      .select("score, components")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tier = (snap?.components as any)?.tier_name || (snap?.components as any)?.tier || null;

    // Brand tokens
    const { data: dsRow } = await admin
      .from("design_system")
      .select("tokens")
      .eq("is_active", true)
      .maybeSingle();
    const ds = (dsRow?.tokens as any) || {};
    const BRAND = ds?.colors?.brand?.light || "#B08D3A";
    const FONT = ds?.typography?.body || "DM Sans";

    const { subject, html } = buildEmail(email_type, {
      BRAND, FONT,
      firstName: profile?.first_name || "",
      sectorFocus: profile?.sector_focus || null,
      entriesCount: entriesCount || 0,
      topSignals: (signals as any[]) || [],
      score: snap?.score ?? null,
      tier,
      signalCount: signalCount || 0,
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [recipient],
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend failed", resendRes.status, errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendInfo = await resendRes.json().catch(() => ({}));

    await admin.from("lifecycle_emails").insert({
      user_id,
      email_type,
      metadata: { subject, recipient, resend_id: (sendInfo as any)?.id || null },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-lifecycle-email error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});