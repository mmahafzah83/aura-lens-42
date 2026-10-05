// send-read-email
// Emails the member the read they just finished, so it exists somewhere other
// than a browser tab. Called once, at the end of onboarding, by the member.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { readEmail } from "../_shared/personEmails.ts";
import { resolveEmailLang } from "../_shared/emailLang.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM = "KnownBy <invites@aura-intel.org>";

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

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (!RESEND_KEY) return json({ error: "RESEND_API_KEY missing" }, 500);

    // Delivery must be provable afterwards: every attempt is logged, success or not.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const lang = await resolveEmailLang(body?.lang, admin, user.id);
    const mail = readEmail(lang, { archetype, marketRead, subjects, thin });
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
        subject: mail.subject,
        html: mail.html,
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
