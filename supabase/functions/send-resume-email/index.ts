// send-resume-email
// One quiet nudge, once, when a member chooses "Finish later" part-way through
// the journey. Never a sequence — the caller records that it has been sent.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { emailShell, heading, button } from "../_shared/email-theme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM = "Aura <invites@aura-intel.org>";

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
    const stage = Number(body?.stage || 0);
    const line = stage
      ? `You stopped at step ${stage} of 5. Everything you answered is saved.`
      : `Everything you answered is saved.`;

    const html = emailShell({
      preheader: "Pick up where you left off",
      body: [
        heading("Pick up where you left off"),
        `<p style="font-size:15px;line-height:1.7;color:#1B2733">${line}</p>`,
        button("https://www.aura-intel.org/onboarding", "Pick up where I left off"),
      ].join(""),
    });

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (!RESEND_KEY) return json({ error: "RESEND_API_KEY missing" }, 500);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [user.email], subject: "Pick up where you left off", html }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`Resend failed [${resp.status}]: ${detail}`);
      return json({ error: "Send failed", status: resp.status, details: detail }, resp.status);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("send-resume-email", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});