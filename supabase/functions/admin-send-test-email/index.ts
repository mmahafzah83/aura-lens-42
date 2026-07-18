import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mirror send-lifecycle-email's From address and Resend call exactly.
const FROM = "Aura <Mohammad.Mahafdhah@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: adminFlag } = await userClient.rpc("is_current_user_admin" as never);
    if (!adminFlag) return json({ error: "Forbidden" }, 403);

    const email = userData.user.email;
    const uid = userData.user.id;
    if (!email) return json({ error: "Signed-in admin has no email" }, 400);

    if (!RESEND_KEY) return json({ error: "RESEND_API_KEY missing" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const subject = `Aura test email — ${new Date().toISOString()}`;
    const html = `<p>This is a test email sent from the Admin console through the same Resend path lifecycle emails use.</p><p>Sent at ${new Date().toISOString()}.</p>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    });

    const rawBody = await resendRes.text();
    const status = resendRes.status;
    const ok = status >= 200 && status < 300;

    // Write to lifecycle_email_log regardless of outcome.
    const messageKey = `TEST_${ok ? "OK" : "FAIL"}_${Date.now()}`;
    try {
      await admin.from("lifecycle_email_log").insert({
        user_id: uid,
        message_key: messageKey,
      });
    } catch (e) {
      console.error("lifecycle_email_log insert failed", (e as Error).message);
    }

    return json({
      ok,
      status,
      body: rawBody.slice(0, 4000),
      recipient: email,
      from: FROM,
      message_key: messageKey,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});