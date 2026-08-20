// send-read-email
// Emails the member the read they just finished, so it exists somewhere other
// than a browser tab. Called once, at the end of onboarding, by the member.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderEmail, heading, INK, INK_SOFT } from "../_shared/emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM = "Aura <invites@aura-intel.org>";
const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user?.email) return json({ error: "Not signed in" }, 401);

    const body = await req.json().catch(() => ({}));
    const archetype = String(body?.archetype || "").slice(0, 200);
    const marketRead = String(body?.marketRead || "").slice(0, 2000);
    const subjects: string[] = Array.isArray(body?.subjects) ? body.subjects.slice(0, 5).map(String) : [];
    const thin: string[] = Array.isArray(body?.softGround) ? body.softGround.slice(0, 3).map(String) : [];
    if (!archetype && !marketRead) return json({ error: "Nothing to send yet" }, 400);

    const list = (items: string[]) =>
      `<ul style="margin:8px 0 0;padding-inline-start:20px;color:#5B6673;font-size:15px;line-height:1.65">
        ${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

    const html = renderEmail({
      preheader: "Your read from Aura",
      body: [
        heading("How people see you"),
        archetype ? `<p style="font-size:20px;font-weight:700;color:${INK};margin:0 0 12px">${esc(archetype)}</p>` : "",
        marketRead ? `<p style="font-size:15px;line-height:1.7;color:${INK_SOFT}">${esc(marketRead)}</p>` : "",
        subjects.length ? `<p style="font-size:13px;color:${INK_SOFT};margin:22px 0 0">The subjects you own</p>${list(subjects)}` : "",
        thin.length ? `<p style="font-size:13px;color:${INK_SOFT};margin:22px 0 0">Where you're thinnest</p>${list(thin)}` : "",
        `<p style="font-size:13px;line-height:1.6;color:${INK_SOFT};margin:24px 0 0">This is a read, not a verdict. If it got you wrong, reply to this email and tell me what it missed — I read every reply myself, and the read changes.</p>`,
      ].join(""),
      cta: { href: "https://www.aura-intel.org/home", label: "Open Aura" },
    });

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (!RESEND_KEY) return json({ error: "RESEND_API_KEY missing" }, 500);

    // Delivery must be provable afterwards: every attempt is logged, success or not.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const logAttempt = async (key: string) => {
      try {
        await admin.from("lifecycle_email_log").insert({ user_id: user.id, message_key: key });
      } catch (e) { console.error("lifecycle_email_log write failed", e); }
    };

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [user.email],
        // The ask has to land somewhere a person reads.
        reply_to: "Mohammad.Mahafdhah@aura-intel.org",
        subject: "Your read from Aura",
        html,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`Resend failed [${resp.status}]: ${detail}`);
      await logAttempt(`read_email_failed_${new Date().toISOString()}`);
      return json({ error: "Send failed", status: resp.status, details: detail }, resp.status);
    }
    await logAttempt("read_email");
    return json({ ok: true, to: user.email });
  } catch (e) {
    console.error("send-read-email", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
