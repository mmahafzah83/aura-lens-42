import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  renderEmail,
  escapeHtml,
  label,
  heading,
  paragraph,
  divider,
  BODY,
  INK,
  INK_SOFT,
} from "../_shared/emailTemplate.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TO = "mohammad.mahafdhah@aura-intel.org";
const FROM = "Aura <invites@aura-intel.org>";

const TOPICS = [
  "Getting access",
  "Something is broken",
  "Billing",
  "Partnership",
  "Something else",
];

function bad(error: string) {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== "object") return bad("Malformed request.");

    // Honeypot: a person never fills this. Accept and drop.
    if (typeof raw.company === "string" && raw.company.trim() !== "") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const email = typeof raw.email === "string" ? raw.email.trim() : "";
    const topic = typeof raw.topic === "string" ? raw.topic.trim() : "";
    const message = typeof raw.message === "string" ? raw.message.trim() : "";

    if (!name || !email || !topic || !message) return bad("Every field is required.");
    if (name.length > 120) return bad("Name must be under 120 characters.");
    if (!EMAIL_RE.test(email) || email.length > 320) return bad("Enter a valid email address.");
    if (!TOPICS.includes(topic)) return bad("Pick a topic from the list.");
    if (message.length < 10) return bad("Message must be at least 10 characters.");
    if (message.length > 5000) return bad("Message must be under 5000 characters.");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("contact-message: RESEND_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Email is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeTopic = escapeHtml(topic);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    const html = renderEmail({
      preheader: `${safeTopic} — from ${safeName}`,
      body: [
        label("New message"),
        heading(safeTopic),
        paragraph(`<strong style="color:${INK};">${safeName}</strong> &middot; ${safeEmail}`, true),
        divider(),
        `<p style="margin:16px 0 0;font-family:${BODY};font-size:15px;line-height:1.7;color:${INK_SOFT};">${safeMessage}</p>`,
      ].join(""),
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: `Contact — ${topic} — ${name}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`contact-message: Resend failed [${res.status}]: ${detail}`);
      return new Response(JSON.stringify({ error: "Could not send the message." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await res.text();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("contact-message: unexpected failure", err);
    return new Response(JSON.stringify({ error: "Unexpected failure." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
