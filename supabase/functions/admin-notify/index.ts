import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const RESEND = Deno.env.get("RESEND_API_KEY") || "";
    const ADMIN_ALERT_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "";

    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const apiKeyHeader = req.headers.get("apikey") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    if (!isServiceRole && !isCron) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "").slice(0, 300);
    const message = String(body.body || "").slice(0, 4000);
    const rawSeverity = String(body.severity || "info").toLowerCase();
    const severity: "critical" | "high" | "info" =
      rawSeverity === "critical" || rawSeverity === "high" ? rawSeverity : "info";
    const force_email = body.force_email === true;
    const dedupe_key = String(body.dedupe_key || "").slice(0, 200);
    const isHtml = body.html === true;

    if (!subject || !message || !dedupe_key) {
      return json({ error: "subject, body, dedupe_key required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Dedupe against ops_alerts: same source in last 20h
    const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("ops_alerts")
      .select("id")
      .eq("source", dedupe_key)
      .gte("created_at", cutoff)
      .limit(1);

    const duplicate = !!(recent && recent.length > 0);

    let emailed = false;
    const shouldEmail = severity === "critical" || severity === "high" || force_email;
    if (!duplicate && shouldEmail && RESEND && ADMIN_ALERT_EMAIL) {
      const bodyBlock = isHtml
        ? message
        : `<pre style="font:13px/1.5 monospace;background:#0f0e0c;color:#ededed;padding:12px;border-radius:8px;white-space:pre-wrap;">${esc(message)}</pre>`;
      const severityLine = isHtml ? "" : `<p><strong>Severity:</strong> ${esc(severity)}</p>`;
      const html = `${severityLine}${bodyBlock}<p style="color:#888;font-size:12px;">source: ${esc(dedupe_key)} · ${new Date().toISOString()}</p>`;
      const er = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Aura <alerts@aura-intel.org>",
          to: [ADMIN_ALERT_EMAIL],
          subject,
          html,
        }),
      });
      emailed = er.ok;
      if (!er.ok) console.error("[admin-notify] email failed", er.status, (await er.text()).slice(0, 200));
    }

    // Persist ops alert (skip if duplicate)
    if (!duplicate) {
      const { error: opsErr } = await admin.from("ops_alerts").insert({
        subject,
        body: message,
        severity,
        source: dedupe_key,
        emailed,
      });
      if (opsErr) console.error("[admin-notify] ops_alerts insert failed", opsErr.message);
    }

    return json({ ok: true, duplicate, emailed, severity, gated: !shouldEmail });
  } catch (e) {
    console.error("admin-notify error", e);
    return json({ error: (e as Error).message }, 500);
  }
});