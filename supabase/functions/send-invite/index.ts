import {
  renderEmail, label, heading, paragraph, note, quote, divider, signature,
  escapeHtml as esc,
} from "../_shared/emailTemplate.ts";

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
  const step = (n: string, title: string, desc: string) => `
    <tr>
      <td valign="top" width="26" style="width:26px;padding:0 12px 16px 0;font-family:'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;font-size:11px;letter-spacing:.16em;color:#98A2AE;line-height:1.6;">${n}</td>
      <td valign="top" style="padding:0 0 16px;">
        <div style="font-family:'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:14px;font-weight:600;color:#0F1519;margin:0 0 4px;">${title}</div>
        <div style="font-family:'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:13px;line-height:1.6;color:#5B6673;">${desc}</div>
      </td>
    </tr>`;

  const body = `
    ${label("A private invitation")}
    ${heading("{{GREETING}} your Aura is ready.")}
    ${paragraph("I built Aura because the smartest people I know stay invisible. Not for lack of expertise — for lack of a way to turn what they already read and think into something the market can see.")}
    ${paragraph("Aura reads what you read, finds the pattern in it, and drafts a post in your own voice. You approve it. That's the whole loop.")}
    {{INVITER_NOTE_BLOCK}}
    ${divider()}
    ${label("Your first ten minutes")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
      ${step("01", "Accept your invitation", "One click from the button below.")}
      ${step("02", "Tell Aura who you are", "Paste your LinkedIn headline. No forms.")}
      ${step("03", "Calibrate your strengths", "Ten sliders, your own read. Aura corrects it from there.")}
      ${step("04", "See how the market reads you", "The first thing Aura gives back.")}
    </table>
    ${divider()}
    ${paragraph("Fewer than 50 people have access right now. I read your profile myself before sending this.")}
    ${note("This link expires in 24 hours.")}
    ${signature()}
  `;

  return renderEmail({
    preheader: "A private invitation. Fewer than 50 people have access.",
    body,
    cta: { href: "{{CONFIRMATION_URL}}", label: "Open my Aura" },
  });
};

serve(withObserve("send-invite", async (req) => {
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

    const inviterNoteBlock = inviterNote ? quote(esc(inviterNote)) : "";

    // Build email HTML
    const greeting = firstName ? `${esc(firstName)},` : "Hi there,";
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

    // Audit log (non-blocking)
    try {
      await admin.from("admin_action_log").insert({
        actor_id: callerId ?? null,
        action: "invite",
        task: "invite",
        target_ref: email,
        result: "sent",
      });
    } catch (logErr) {
      console.warn("[send-invite] admin_action_log insert failed", logErr);
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
}));
