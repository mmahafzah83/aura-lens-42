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

function renderCard(opts: {
  what: string;
  impact: string;
  action: string;
  detail: string;
  body: string;
  severity: "critical" | "high" | "info";
  dedupe_key: string;
}) {
  const { what, impact, action, detail, body, severity, dedupe_key } = opts;
  const paper = "#F1ECE1", card = "#FBF8F1", ink = "#1B1712", rule = "#E2DACB", muted = "#6B6255";
  const serif = "Georgia, 'Times New Roman', serif";
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  let pill = "";
  if (severity === "critical") {
    pill = `<div style="display:inline-block;font:11px/1 ${mono};letter-spacing:.14em;text-transform:uppercase;color:#FBF8F1;background:#6E2A26;padding:6px 10px;border-radius:2px;">NEEDS YOU</div>`;
  } else if (severity === "high") {
    pill = `<div style="display:inline-block;font:11px/1 ${mono};letter-spacing:.14em;text-transform:uppercase;color:#FBF8F1;background:#9A7218;padding:6px 10px;border-radius:2px;">HEADS UP</div>`;
  }

  let inner = "";
  if (what) {
    inner += `<h1 style="margin:16px 0 0;font:400 22px/1.35 ${serif};color:${ink};">${esc(what)}</h1>`;
    if (impact) {
      inner += `<p style="margin:14px 0 0;font:400 15px/1.55 ${serif};color:${ink};"><span style="color:${muted};">This affects:</span> ${esc(impact)}</p>`;
    }
    if (action) {
      inner += `<p style="margin:10px 0 0;font:400 15px/1.55 ${serif};color:${ink};">👉 <span style="color:${muted};">What to do:</span> ${esc(action)}</p>`;
    }
    if (detail) {
      inner += `<p style="margin:18px 0 0;font:400 13px/1.5 ${serif};color:${muted};"><em>Why:</em> ${esc(detail)}</p>`;
    }
  } else {
    inner += `<div style="margin:16px 0 0;padding:14px 16px;border:1px solid ${rule};border-radius:4px;background:${card};font:400 14px/1.55 ${serif};color:${ink};white-space:pre-wrap;">${esc(body)}</div>`;
  }

  const footer = `<p style="margin:22px 0 0;font:11px/1.4 ${mono};letter-spacing:.06em;color:${muted};">source: ${esc(dedupe_key)} · ${new Date().toISOString()}</p>`;

  return `<div style="background:${paper};padding:24px 12px;">
    <div style="max-width:560px;margin:0 auto;background:${card};border:1px solid ${rule};border-radius:6px;padding:22px 22px 20px;">
      ${pill}
      ${inner}
      ${footer}
    </div>
  </div>`;
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
    const what = String(body.what || "").slice(0, 400);
    const impact = String(body.impact || "").slice(0, 400);
    const action = String(body.action || "").slice(0, 400);
    const detail = String(body.detail || "").slice(0, 1000);
    const resolve = body.resolve === true;

    const admin = createClient(supabaseUrl, serviceKey);

    if (resolve) {
      if (!dedupe_key) return json({ error: "dedupe_key required for resolve" }, 400);
      const { data: closed } = await admin
        .from("ops_alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("source", dedupe_key).eq("status", "open").select("id");
      return json({ ok: true, resolved: (closed || []).length });
    }

    if (!subject || !message || !dedupe_key) {
      return json({ error: "subject, body, dedupe_key required" }, 400);
    }

    const nowIso = new Date().toISOString();
    const isProblem = severity === "critical" || severity === "high";
    const shouldEmail = isProblem || force_email;

    let openRow: any = null;
    if (isProblem) {
      const { data } = await admin.from("ops_alerts")
        .select("id, last_emailed, occurrences")
        .eq("source", dedupe_key).eq("status", "open")
        .order("created_at", { ascending: false }).limit(1);
      openRow = data && data[0] ? data[0] : null;
    }

    const twentyH = 20 * 60 * 60 * 1000;
    const recentlyEmailed = !!(openRow?.last_emailed && Date.now() - new Date(openRow.last_emailed).getTime() < twentyH);
    const doEmail = shouldEmail && !!RESEND && !!ADMIN_ALERT_EMAIL && !(openRow && recentlyEmailed);

    let emailed = false;
    if (doEmail) {
      const htmlOut = isHtml ? message : renderCard({ what, impact, action, detail, body: message, severity, dedupe_key });
      const er = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "Aura <alerts@aura-intel.org>", to: [ADMIN_ALERT_EMAIL], subject, html: htmlOut }),
      });
      emailed = er.ok;
      if (!er.ok) console.error("[admin-notify] email failed", er.status, (await er.text()).slice(0, 200));
    }

    if (openRow) {
      await admin.from("ops_alerts").update({
        last_seen: nowIso,
        occurrences: (openRow.occurrences || 1) + 1,
        severity, subject, body: message,
        what: what || null, impact: impact || null, action: action || null,
        ...(emailed ? { emailed: true, last_emailed: nowIso } : {}),
      }).eq("id", openRow.id);
      return json({ ok: true, updated: true, emailed });
    } else {
      const { error: opsErr } = await admin.from("ops_alerts").insert({
        subject, body: message, severity, source: dedupe_key, emailed,
        what: what || null, impact: impact || null, action: action || null,
        status: isProblem ? "open" : "resolved",
        last_seen: nowIso, occurrences: 1,
        last_emailed: emailed ? nowIso : null,
      });
      if (opsErr) console.error("[admin-notify] ops_alerts insert failed", opsErr.message);
      return json({ ok: true, created: true, emailed });
    }
  } catch (e) {
    console.error("admin-notify error", e);
    return json({ error: (e as Error).message }, 500);
  }
});