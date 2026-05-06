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

type EmailType = "welcome" | "day1" | "day3" | "day7" | "inactive" | "silence";

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
    fadingSignals: { signal_title: string; confidence: number; velocity_status: string | null }[];
    fadingCount: number;
    publishedCount: number;
    recentTrend: { headline: string; source: string } | null;
  },
): { subject: string; html: string } {
  const { BRAND, FONT, firstName, sectorFocus, level, entriesCount, topSignals, score, tier, signalCount, fadingSignals, fadingCount, publishedCount, recentTrend } = ctx;
  const name = firstName || "there";
  const focus = sectorFocus && sectorFocus.trim() ? sectorFocus.trim() : "your sector";
  const tierMessage = (() => {
    const t = (tier || "").toLowerCase();
    if (t.includes("authority")) return "You're in the top tier. Maintain your edge.";
    if (t.includes("strategist")) return "You're reading the market — patterns are forming.";
    return "You're building your intelligence foundation.";
  })();

  if (type === "welcome") {
    const subject = "Your intelligence OS is active";
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
    const subject = "Your first signals are forming";
    const top = topSignals[0];
    const body = top
      ? `
        ${heading(`${name}, your signal graph is forming.`)}
        <p style="margin:0 0 18px;">Aura detected ${signalCount} pattern${signalCount === 1 ? "" : "s"} from your captures. Your strongest: <strong>${top.signal_title}</strong> at ${Math.round(top.confidence * 100)}% confidence.</p>
        <p style="margin:0 0 18px;">This is the topic where your intelligence runs deepest. One more capture on this topic strengthens the signal. Two more and Aura can generate a post that sounds like you wrote it.</p>
        ${ctaButton(BRAND, "See your signals →", `${APP_URL}/dashboard?tab=intelligence`)}
        ${signoff(name, level)}`
      : `
        ${heading(`${name}, your signal graph is waiting.`)}
        <p style="margin:0 0 18px;">The captures you've made are being analyzed — signals emerge when Aura detects recurring themes across multiple sources.</p>
        <p style="margin:0 0 18px;">Feed it one more article. That's all it takes to start the pattern.</p>
        ${ctaButton(BRAND, "Capture something →", APP_URL)}
        ${signoff(name, level)}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day3") {
    const subject = "The market moved this week — here's what matters to you";
    const trendLine = recentTrend
      ? `The market conversation in ${focus} shifted — '<strong>${recentTrend.headline}</strong>' (via ${recentTrend.source}). You have ${signalCount} active signal${signalCount === 1 ? "" : "s"} tracking this space.`
      : `Aura is watching ${focus} for fresh market movement. You have ${signalCount} active signal${signalCount === 1 ? "" : "s"} ready to anchor your next post.`;
    const body = `
      ${heading(`${name}, your authority score is ${score ?? 0}.`)}
      <p style="margin:0 0 18px;">${tierMessage}</p>
      <p style="margin:0 0 18px;">${trendLine}</p>
      <p style="margin:0 0 18px;">Publishing from your strongest signal builds authority fastest. Your signals are ready.</p>
      ${ctaButton(BRAND, "Generate your first post →", `${APP_URL}/dashboard?tab=publish`)}
      ${signoff(name, level)}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  if (type === "day7") {
    const subject = "Your weekly intelligence brief";
    const top = topSignals[0];
    const topLine = top
      ? `<strong>${top.signal_title}</strong> leads at ${Math.round(top.confidence * 100)}%.`
      : "No leading signal yet — a few more captures unlocks signal detection.";
    const fadingLine = fadingCount > 0
      ? `${fadingCount} signal${fadingCount === 1 ? "" : "s"} fading — they need fresh evidence.`
      : "No signals fading.";
    const trendLine = recentTrend ? `<strong>${recentTrend.headline}</strong> (${recentTrend.source}).` : "Quiet week in your tracked sources.";
    const body = `
      ${heading("One week with Aura. Here's your brief:")}
      <p style="margin:0 0 14px;">${signalCount} active signal${signalCount === 1 ? "" : "s"}. ${topLine} ${fadingLine} ${publishedCount} post${publishedCount === 1 ? "" : "s"} published.</p>
      <p style="margin:0 0 14px;">Authority score: <strong>${score ?? 0}</strong>${tier ? ` (${tier})` : ""}.</p>
      <p style="margin:0 0 18px;">This week's market movement: ${trendLine}</p>
      <p style="margin:0 0 18px;">The professionals who compound authority fastest publish from their signals weekly. Yours are ready.</p>
      ${ctaButton(BRAND, "Open your weekly brief →", `${APP_URL}/dashboard?tab=intelligence`)}
      ${signoff(name, level)}`;
    return { subject, html: shell(BRAND, FONT, body) };
  }

  // silence / inactive — both paths use the same signal-decay framing
  const f1 = fadingSignals[0];
  const f2 = fadingSignals[1];
  const topFadingTitle = f1?.signal_title || "leading";
  const subject = `Your ${topFadingTitle} signal is decaying`;
  const f1Line = f1
    ? `Your '<strong>${f1.signal_title}</strong>' dropped to ${Math.round(f1.confidence * 100)}% confidence.`
    : "Your strongest signals are losing freshness.";
  const f2Line = f2
    ? ` ${f2.signal_title} is now <strong>${f2.velocity_status || "fading"}</strong>.`
    : "";
  const trendLine = recentTrend
    ? `Meanwhile, ${recentTrend.source} published on '<strong>${recentTrend.headline}</strong>' — your territory.`
    : `Meanwhile, the market in ${focus} keeps moving — your territory.`;
  const body = `
    ${heading(`${name}, while you were away:`)}
    <p style="margin:0 0 18px;">${f1Line}${f2Line}</p>
    <p style="margin:0 0 18px;">${trendLine}</p>
    <p style="margin:0 0 18px;">One capture reverses the trajectory. The intelligence graph rewards consistency, not volume.</p>
    ${ctaButton(BRAND, "Capture now →", APP_URL)}
    ${signoff(name, level)}`;
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
    const types: EmailType[] = ["welcome", "day1", "day3", "day7", "inactive", "silence"];
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
    if (existing && existing.length > 0 && email_type !== "inactive" && email_type !== "silence") {
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

    // Fading signals (decaying / dormant — lowest confidence first)
    const { data: fading, count: fadingCount } = await admin
      .from("strategic_signals")
      .select("signal_title, confidence, velocity_status", { count: "exact" })
      .eq("user_id", user_id)
      .in("velocity_status", ["fading", "dormant"])
      .order("confidence", { ascending: true })
      .limit(3);

    // Published post count
    const { count: publishedCount } = await admin
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("tracking_status", "published");

    // Recent trend (last 7 days, not dismissed, top by final_score)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trendRow } = await admin
      .from("industry_trends")
      .select("headline, source")
      .eq("user_id", user_id)
      .neq("status", "dismissed")
      .gte("fetched_at", sevenDaysAgo)
      .order("final_score", { ascending: false })
      .limit(1)
      .maybeSingle();

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
      fadingSignals: (fading as any[]) || [],
      fadingCount: fadingCount || 0,
      publishedCount: publishedCount || 0,
      recentTrend: trendRow ? { headline: (trendRow as any).headline, source: (trendRow as any).source } : null,
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
