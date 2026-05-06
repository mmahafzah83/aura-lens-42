import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://aura-intel.org";
const FROM = "Mohammad Mahafzah <mohammad.mahafdhah@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";

type EmailType = "welcome" | "day1" | "day3" | "day7" | "inactive";

const HEADING_FONT = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif";

function horizonEye(size: number, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 80 80" fill="none">
    <path d="M8 40 C 22 22, 58 22, 72 40 C 58 58, 22 58, 8 40 Z" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="40" cy="40" r="11" stroke="${color}" stroke-width="2" fill="none"/>
    <circle cx="40" cy="40" r="4" fill="${color}"/>
    <line x1="40" y1="6" x2="40" y2="14" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="40" y1="66" x2="40" y2="74" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="6" y1="40" x2="14" y2="40" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="66" y1="40" x2="74" y2="40" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function shell(BRAND: string, _FONT: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:${BODY_FONT};color:#1c1812;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#ffffff;border-radius:12px;overflow:hidden;">
    <div style="padding:32px 36px 0;">${horizonEye(40, BRAND)}</div>
    <div style="padding:20px 36px 36px;line-height:1.7;font-size:15px;color:#3a3530;">
      ${body}
    </div>
    <div style="padding:20px 36px;border-top:1px solid #efeae0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:10px;">${horizonEye(20, BRAND)}</td>
        <td style="vertical-align:middle;font-size:12px;color:#6b665c;">Aura · Strategic Intelligence · <a href="${APP_URL}" style="color:#6b665c;text-decoration:none;">aura-intel.org</a></td>
      </tr></table>
    </div>
  </div>
</div></body></html>`;
}

function ctaButton(BRAND: string, label: string, href: string) {
  return `<p style="margin:28px 0;"><a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:0 28px;height:44px;line-height:44px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;font-family:${BODY_FONT};">${label}</a></p>`;
}

function heading(text: string) {
  return `<h1 style="font-family:${HEADING_FONT};font-size:28px;line-height:1.2;font-weight:500;color:#1c1812;margin:0 0 20px;">${text}</h1>`;
}

function signoff(firstName: string, level: string | null) {
  const role = level ? `${level}` : "Founder, Aura";
  return `<p style="margin-top:28px;color:#3a3530;">— ${firstName || "Mohammad"}, ${role}<br/><span style="color:#8a8478;font-size:13px;">Aura · Strategic Intelligence</span></p>`;
}

function buildEmail(
  type: EmailType,
  ctx: {
    BRAND: string;
    FONT: string;
    firstName: string;
    sectorFocus: string | null;
    level: string | null;
    entriesCount: number;
    topSignals: { signal_title: string; confidence: number }[];
    score: number | null;
    tier: string | null;
    signalCount: number;
  },
): { subject: string; html: string } {
  const { BRAND, FONT, firstName, sectorFocus, level, entriesCount, topSignals, score, tier, signalCount } = ctx;
  const name = firstName || "there";

  if (type === "welcome") {
    const subject = "Your intelligence OS is active";
    const focus = sectorFocus && sectorFocus.trim() ? sectorFocus.trim() : "your sector";
    const body = `
      ${heading(`Welcome to Aura, ${name}.`)}
      <p style="margin:0 0 18px;">Your system is live. Every article you capture, every insight you note, every voice memo you record — Aura finds the strategic patterns you didn't know were there.</p>
      <p style="margin:0 0 18px;">Your first mission: capture one thing you read this week that shaped your thinking about ${focus}. That single capture seeds your signal graph.</p>
      <p style="margin:0 0 18px;">One capture. That's the beginning.</p>
      ${ctaButton(BRAND, "Make your first capture →", APP_URL)}
      ${signoff(name, level)}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day1") {
    const subject = "Did Aura find your first signal?";
    const body =
      entriesCount < 3
        ? `<p>Hi ${name},</p><p>Aura needs a few captures to start surfacing signals. Drop in one article — anything you read this morning works.</p>${ctaButton(BRAND, "Capture now", APP_URL)}${signoff(name, level)}`
        : `<p>Hi ${name},</p><p>Nice — ${entriesCount} captures in. Aura should be surfacing your first signals. Take 30 seconds to look.</p>${ctaButton(BRAND, "See Intelligence", APP_URL)}${signoff(name, level)}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day3") {
    const subject = `Your intelligence is building, ${name}`;
    const top = topSignals[0];
    const body = top
      ? `<p>Hi ${name},</p><p>Top signal so far: <strong>"${top.signal_title}"</strong> (${Math.round(top.confidence * 100)}% confidence).</p><p>That's a publishable angle. Want to draft on it?</p>${ctaButton(BRAND, "Draft a post", APP_URL)}${signoff(name, level)}`
      : `<p>Hi ${name},</p><p>Aura hasn't found enough patterns yet — a few more captures unlocks signal detection. Aim for five total.</p>${ctaButton(BRAND, "Capture more", APP_URL)}${signoff(name, level)}`;
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
      ${signoff(name, level)}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  // inactive
  const subject = `Your authority score is slipping, ${name}`;
  const body = `<p>Hi ${name},</p><p>No captures in five days — your authority score drifts when Aura goes quiet. One capture reverses it.</p>${ctaButton(BRAND, "Capture one thing", APP_URL)}${signoff(name, level)}`;
  return { subject, html: shell(BRAND, FONT, body) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, email_type } = await req.json();
    if (!user_id || !email_type) {
      return new Response(JSON.stringify({ error: "user_id and email_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const types: EmailType[] = ["welcome", "day1", "day3", "day7", "inactive"];
    if (!types.includes(email_type)) {
      return new Response(JSON.stringify({ error: "invalid email_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recipient email
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(user_id);
    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipient = userData.user.email;

    // Profile
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("first_name, sector_focus, level")
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
    const { data: dsRow } = await admin.from("design_system").select("tokens").eq("is_active", true).maybeSingle();
    const ds = (dsRow?.tokens as any) || {};
    const BRAND = ds?.colors?.brand?.light || "#B08D3A";
    const FONT = ds?.typography?.body || "DM Sans";

    const { subject, html } = buildEmail(email_type, {
      BRAND,
      FONT,
      firstName: profile?.first_name || "",
      sectorFocus: profile?.sector_focus || null,
      level: (profile as any)?.level || null,
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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendInfo = await resendRes.json().catch(() => ({}));

    await admin.from("lifecycle_emails").insert({
      user_id,
      email_type,
      metadata: { subject, recipient, resend_id: (sendInfo as any)?.id || null },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-lifecycle-email error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
