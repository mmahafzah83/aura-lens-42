import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  emailShell, sectionLabel, heading, divider, button, pullQuote,
  CARD, RULE, INK, INK_BODY, INK_MUTE, AMBER, OXBLOOD,
  SERIF, BODY, MONO, ARABIC,
} from "../_shared/email-theme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
// Where Supabase sends the user AFTER it verifies the invite token.
const REDIRECT_URL = "https://aura-intel.org/auth";
// Public ceremony page shown BEFORE the token is verified — the user clicks
// "Let the world see what I know →" here, which then triggers Supabase verify.
const ACCEPTANCE_URL = "https://aura-intel.org/accept-invitation";

const buildEmailHtml = () => {
  const statCell = (num: string, desc: string) => `
    <td valign="top" style="width:50%;padding:14px 12px;background:${CARD};border:1px solid ${RULE};border-radius:8px;">
      <div style="font-family:${SERIF};font-size:28px;line-height:1.1;color:${OXBLOOD};margin:0 0 8px;">${num}</div>
      <div style="font-family:${BODY};font-size:12px;line-height:1.5;color:${INK_MUTE};">${desc}</div>
    </td>`;
  const statSpacer = `<td style="width:12px;font-size:0;line-height:0;">&nbsp;</td>`;

  const milestone = (
    label: string,
    title: string,
    desc: string,
    filled: boolean,
    isLast: boolean,
  ) => {
    const dot = filled
      ? `<div style="width:13px;height:13px;border-radius:50%;background:${AMBER};margin:4px auto 0;"></div>`
      : `<div style="width:13px;height:13px;border-radius:50%;border:1px solid ${RULE};box-sizing:border-box;margin:4px auto 0;"></div>`;
    const line = isLast
      ? ""
      : `<div style="width:1px;background:${RULE};margin:6px auto 0;height:100%;min-height:48px;"></div>`;
    return `
      <tr>
        <td valign="top" width="28" style="width:28px;padding:0 12px 0 0;">
          ${dot}
          ${line}
        </td>
        <td valign="top" style="padding:0 0 22px;">
          <div style="font-family:${MONO};font-size:10px;letter-spacing:1.5px;color:${INK_MUTE};font-weight:700;margin:0 0 6px;">${label}</div>
          <div style="font-family:${BODY};font-size:14px;color:${INK};font-weight:600;margin:0 0 6px;line-height:1.4;">${title}</div>
          <div style="font-family:${BODY};font-size:13px;color:${INK_BODY};line-height:1.55;">${desc}</div>
        </td>
      </tr>`;
  };

  const howRow = (symbol: string, title: string, desc: string, accent: string = AMBER) => `
    <tr>
      <td valign="top" width="28" style="width:28px;padding:0 12px 18px 0;font-family:${SERIF};font-size:18px;color:${accent};line-height:1.2;">${symbol}</td>
      <td valign="top" style="padding:0 0 18px;">
        <div style="font-family:${BODY};font-size:14px;color:${INK};font-weight:600;margin:0 0 6px;">${title}</div>
        <div style="font-family:${BODY};font-size:13px;color:${INK_BODY};line-height:1.6;">${desc}</div>
      </td>
    </tr>`;

  const body = `
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">{{GREETING}}</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">I don't send these often. And I'll be honest with you.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 20px;">I built Aura because I was tired of watching the smartest people in the room stay invisible.</p>
    ${pullQuote("You know the feeling. You've spent years becoming exceptional at what you do. You've led teams, shaped strategy, solved problems most people can't even name. But when someone outside your direct circle searches your name — they find almost nothing. No signal. No fingerprint. No proof of what you actually know.")}
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">Meanwhile, professionals who publish consistently — even when their expertise is narrower than yours — are the ones getting invited to the table. The keynote slots. The "have you seen what they wrote?" reputation.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">The problem was never your expertise. It was never your knowledge. It was never your ideas.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 20px;">The problem is that <strong style="color:${INK};">no one has helped you turn what's in your head into what the market sees.</strong></p>
    <p style="font-family:${SERIF};font-size:22px;line-height:1.3;color:${OXBLOOD};margin:8px 0 28px;">Until now.</p>

    ${divider()}

    ${sectionLabel("WHY I BUILT THIS")}
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">Because I'm one of you.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">I read 30+ articles a week. I see patterns in digital transformation that most reports miss. I hold opinions that could shape how utilities and infrastructure organizations think about their future.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">But for years, all of that stayed locked in my head, my notes, my devices. The market had no idea.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 22px;">So I built the system I wished existed. One that takes what I already read, finds the strategic patterns, understands my voice and my expertise — and turns it into a digital presence that compounds over time.</p>
    <p style="font-family:${SERIF};font-size:20px;line-height:1.3;color:${OXBLOOD};margin:0 0 28px;">I called it Aura. And now it's ready for you.</p>

    ${divider()}

    ${sectionLabel("THE NUMBERS DON'T LIE")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;margin:0 0 12px;">
      <tr>
        ${statCell("73%", "of decision-makers trust expertise content over marketing materials")}
        ${statSpacer}
        ${statCell("82%", "trust companies more when senior leaders are visible online")}
      </tr>
      <tr><td colspan="3" style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr>
        ${statCell("54%", "have rejected candidates because of invisible online presence")}
        ${statSpacer}
        ${statCell("<3%", "of LinkedIn's 1B+ users create original content weekly")}
      </tr>
      <tr><td colspan="3" style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr>
        <td colspan="3" valign="top" style="padding:14px 12px;background:${CARD};border:1px solid ${RULE};border-radius:8px;text-align:center;">
          <div style="font-family:${SERIF};font-size:28px;line-height:1.1;color:${OXBLOOD};margin:0 0 8px;">44%</div>
          <div style="font-family:${BODY};font-size:12px;line-height:1.5;color:${INK_MUTE};">of company value is tied to its leader's reputation</div>
        </td>
      </tr>
    </table>
    <p style="font-family:${BODY};font-size:14px;line-height:1.7;color:${INK_BODY};margin:22px 0 14px;">You're already in the top 1% of expertise. Aura puts you in the top 1% of visibility — without changing how you spend your week.</p>
    <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0 0 26px;">Sources: Edelman-LinkedIn 2024/2025, Weber Shandwick, Brunswick Group</p>

    ${divider()}

    ${sectionLabel("HOW AURA WORKS")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${howRow("&#10022;", "The identity map", "Aura doesn't start with content. It starts with YOU. Your strengths. Your sector expertise. Your natural voice. It builds a complete map of who you are professionally — so nothing it creates is generic.", AMBER)}
      ${howRow("&#9670;", "The intelligence engine", "You read an article. Aura reads it too. It finds the strategic pattern you'd miss on a busy Tuesday — and connects it to what matters in your sector right now.", OXBLOOD)}
      ${howRow("&#9671;", "The voice studio", "Aura writes in your voice. Not templates. Not AI speak. Content that sounds like you wrote it at your absolute best — the version of you that had 3 uninterrupted hours to think and write.", AMBER)}
      ${howRow("&#9679;", "The Imprint", "Aura tracks your digital visibility over time — what's working, what's growing, where the right people are noticing you. Your reputation, measured and compounding.", OXBLOOD)}
    </table>

    ${divider()}

    ${sectionLabel("WHAT CHANGES FOR YOU")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${milestone("DAY 1", "Aura learns who you are.", "Your strengths. Your sector. Your voice. By the end of your first session, Aura knows what makes you different from every other professional in your market.", true, false)}
      ${milestone("WEEK 1", "Your first post goes live.", "A LinkedIn post that sounds like you — not like AI. About a signal Aura found in what you read. Your expertise, visible for the first time to people who've never met you.", true, false)}
      ${milestone("MONTH 1", "People start to notice.", "Consistent, intelligent content builds recognition. Decision-makers in your sector start seeing your name next to insights they care about. The compound effect begins.", false, false)}
      ${milestone("MONTH 3", "The invitations arrive.", "Speaking panels. Advisory requests. DMs from people you've never met saying 'I've been following your content.' The market is finding you — because Aura made your expertise impossible to miss.", false, false)}
      ${milestone("YEAR 1", "You own your space.", "When someone in your industry mentions your topic — your name comes up. Not because you marketed yourself. Because your expertise finally has the fingerprint it always deserved.", false, true)}
    </table>

    ${divider()}

    ${sectionLabel("YOUR INVITATION")}
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 14px;">You're one of fewer than 50 professionals with access right now.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">This isn't a mass email. I reviewed your profile personally.</p>
    {{INVITER_NOTE_BLOCK}}
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">When you click below, Aura will guide you through a 10-minute experience unlike anything you've seen in a professional tool. It will learn your voice, map your strengths, and show you how the market sees your expertise.</p>
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 26px;">Give it your full attention. It's worth it.</p>
    <div style="margin:0 0 14px;">${button("{{CONFIRMATION_URL}}", "Open my Aura →")}</div>
    <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0 0 28px;">This link expires in 24 hours.</p>

    ${divider()}

    ${sectionLabel("YOUR FIRST 10 MINUTES")}
    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 22px;">You'll feel the difference immediately.</p>

    <p style="font-family:${BODY};font-size:14px;line-height:1.7;color:${INK};margin:0 0 4px;font-weight:600;">1 · Accept your invitation</p>
    <p style="font-family:${BODY};font-size:13px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">A welcome that shows you this was built for someone at your level.</p>

    <p style="font-family:${BODY};font-size:14px;line-height:1.7;color:${INK};margin:0 0 4px;font-weight:600;">2 · Tell Aura who you are</p>
    <p style="font-family:${BODY};font-size:13px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">Paste your LinkedIn headline. Aura reads it in 3 seconds — no forms, no typing.</p>

    <p style="font-family:${BODY};font-size:14px;line-height:1.7;color:${INK};margin:0 0 4px;font-weight:600;">3 · Calibrate your edge</p>
    <p style="font-family:${BODY};font-size:13px;line-height:1.7;color:${INK_BODY};margin:0 0 18px;">10 quick strength sliders. Aura uses them to understand what truly sets you apart — and gives you instant insight on each one.</p>

    <p style="font-family:${BODY};font-size:14px;line-height:1.7;color:${INK};margin:0 0 4px;font-weight:600;">4 · See yourself through the market's eyes</p>
    <p style="font-family:${BODY};font-size:13px;line-height:1.7;color:${INK_BODY};margin:0 0 22px;">The moment that changes how you see your own expertise. People screenshot this. You'll understand why.</p>

    ${divider()}

    <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_BODY};margin:0 0 22px;">I'll be watching to see what Aura discovers about you.</p>
    <p dir="rtl" lang="ar" style="font-family:${ARABIC};font-size:16px;color:${OXBLOOD};text-align:center;margin:18px 0 26px;">حتى السوق يعرفك قبل ما يشوفك ✦</p>
    <p style="font-family:${BODY};font-size:15px;color:${INK};font-weight:600;margin:0 0 4px;">Mohammad Mahafdhah</p>
    <p style="font-family:${BODY};font-size:13px;color:${INK_MUTE};margin:0;">Aura builder</p>
  `;

  return emailShell({
    preheader: "A private invitation. Fewer than 50 professionals have access.",
    body,
    maxWidth: 600,
  });
};

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
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    const firstName = rawName ? rawName.split(/\s+/)[0] : "";
    const inviterNote = typeof body.inviter_note === "string" ? body.inviter_note.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Try invite first; if user already exists, fall back to magiclink so
    // the branded email still goes out with a working sign-in link.
    let linkRes = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: REDIRECT_URL },
    });

    if (
      linkRes.error &&
      ((linkRes.error as any).code === "email_exists" ||
        /already been registered/i.test(linkRes.error.message))
    ) {
      console.log(`User ${email} already exists — falling back to magiclink`);
      linkRes = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: REDIRECT_URL },
      });
    }

    if (linkRes.error || !linkRes.data?.properties?.action_link) {
      console.error("generateLink failed:", linkRes.error);
      return new Response(
        JSON.stringify({ error: linkRes.error?.message || "Failed to generate invite link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const confirmationUrl = linkRes.data.properties.action_link;

    // Wrap the Supabase verify URL in our acceptance page so the user sees the
    // ceremony first. The page reads `token`+`type` (and `next` as fallback)
    // and forwards to the original verify URL on CTA click.
    let ceremonyUrl = confirmationUrl;
    try {
      const verifyUrl = new URL(confirmationUrl);
      const t = verifyUrl.searchParams.get("token") || "";
      const ty = verifyUrl.searchParams.get("type") || "invite";
      const ceremony = new URL(ACCEPTANCE_URL);
      ceremony.searchParams.set("token", t);
      ceremony.searchParams.set("type", ty);
      ceremony.searchParams.set("next", confirmationUrl);
      ceremonyUrl = ceremony.toString();
    } catch (e) {
      console.warn("[send-invite] could not wrap confirmationUrl, using raw verify URL", e);
    }

    // Escape inviter note to prevent HTML injection
    const escapeHtml = (s: string) => s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const inviterNoteBlock = inviterNote
      ? `<div style="margin:8px 0 18px;padding:14px 16px;background:${CARD};border:1px solid ${RULE};border-left:3px solid ${AMBER};border-radius:4px;font-family:${BODY};font-size:14px;line-height:1.7;color:${INK_BODY};font-style:italic;">${escapeHtml(inviterNote)}</div>`
      : "";

    // Build email HTML
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
    const html = buildEmailHtml()
      .replace(/{{GREETING}}/g, greeting)
      .replace(/{{CONFIRMATION_URL}}/g, ceremonyUrl)
      .replace(/{{INVITER_NOTE_BLOCK}}/g, inviterNoteBlock)
      .replace(/{{EMAIL}}/g, email);

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
        to: [email],
        subject: firstName ? `Your Aura is ready, ${firstName}` : "Your Aura is ready",
        reply_to: "mohammad.mahafdhah@aura-intel.org",
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
