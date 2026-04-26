import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://www.aura-intel.org";

type AlertType = "timing_window" | "silence_alarm" | "signal_shift" | string;

function urgencyMeta(type: AlertType) {
  switch (type) {
    case "timing_window":
      return { color: "#F97316", label: "Timing window" };
    case "silence_alarm":
      return { color: "#DC2626", label: "Silence alarm" };
    case "signal_shift":
      return { color: "#2563EB", label: "Signal shift" };
    default:
      return { color: "#6B7280", label: "Update" };
  }
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(opts: {
  firstName: string;
  dayDate: string;
  alerts: Array<{ type: string; title: string; body: string }>;
  topSignalTitle: string | null;
  topSignalConfidencePct: number | null;
}): string {
  const { firstName, dayDate, alerts, topSignalTitle, topSignalConfidencePct } = opts;

  const alertsHtml = alerts.length
    ? alerts
        .map((a) => {
          const m = urgencyMeta(a.type);
          return `
        <div style="margin-bottom:14px;padding:18px;background:#faf8f4;border-radius:8px;border-left:4px solid ${m.color};">
          <p style="font-size:12px;font-weight:600;color:${m.color};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(m.label)}</p>
          <p style="font-size:15px;font-weight:600;color:#0d0d0d;margin-bottom:6px;">${escapeHtml(a.title)}</p>
          <p style="font-size:14px;line-height:1.6;color:#555;margin:0;">${escapeHtml(a.body)}</p>
        </div>`;
        })
        .join("")
    : `<div style="margin-bottom:14px;padding:18px;background:#faf8f4;border-radius:8px;border-left:4px solid #6B7280;">
         <p style="font-size:14px;line-height:1.6;color:#333;margin:0;">Your signals are stable this week. Keep capturing — consistency builds authority.</p>
       </div>`;

  const topSignalLine = topSignalTitle
    ? `Your top signal this week: <strong style="color:#0d0d0d;">${escapeHtml(topSignalTitle)}</strong>${
        topSignalConfidencePct !== null ? ` · ${topSignalConfidencePct}% confidence` : ""
      }`
    : "Capture more this week to surface your next top signal.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Aura intelligence brief</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background-color:#f0ede8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .email-wrapper { padding:0 !important; }
    .email-card { border-radius:0 !important; }
    .content-pad { padding:32px 24px !important; }
    .hero-pad { padding:36px 24px 28px !important; }
    .footer-pad { padding:24px 24px !important; }
    .cta-btn { padding:16px 28px !important; font-size:15px !important; }
  }
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;">Your weekly Aura intelligence brief — what shifted in your authority landscape this week.</div>

<div class="email-wrapper" style="padding:24px;background-color:#f0ede8;">
  <div class="email-card" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">

    <div class="hero-pad" style="padding:40px 40px 32px;background:linear-gradient(135deg,#0d0d0d,#1a1a1a);color:#f0f0f0;">
      <p style="font-size:13px;color:#F97316;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">⚡ Aura · Weekly Brief</p>
      <h1 style="font-size:26px;line-height:1.25;font-weight:700;color:#f0f0f0;margin-bottom:8px;">Your intelligence brief</h1>
      <p style="font-size:14px;color:#aaa;line-height:1.5;">${escapeHtml(dayDate)}</p>
    </div>

    <div class="content-pad" style="padding:36px 40px;color:#1a1a1a;">
      <p style="font-size:16px;line-height:1.6;margin-bottom:14px;">Good morning, ${escapeHtml(firstName)}.</p>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:24px;">Here is what shifted in your authority landscape this week.</p>

      ${alertsHtml}

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${APP_URL}" class="cta-btn" style="display:inline-block;background:#F97316;color:#0d0d0d;padding:16px 32px;border-radius:8px;font-weight:700;font-size:15px;">Open Aura · take action →</a>
      </div>

      <p style="font-size:13px;line-height:1.6;color:#555;text-align:center;margin-top:20px;">${topSignalLine}</p>
    </div>

    <div class="footer-pad" style="padding:28px 40px;background:#faf8f4;border-top:1px solid #ece8e0;">
      <p style="font-size:12px;color:#888;line-height:1.6;text-align:center;margin-bottom:6px;">Aura · Strategic Intelligence for senior professionals.</p>
      <p style="font-size:11px;color:#aaa;line-height:1.6;text-align:center;">You're receiving this because you opted in to weekly briefs. Update your notification preferences anytime in Aura → Settings.</p>
    </div>

  </div>
</div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let targetUserId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.user_id === "string") targetUserId = body.user_id;
      } catch {
        // no body — process all users
      }
    }

    // Resolve target user IDs
    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: profiles, error: profErr } = await admin
        .from("diagnostic_profiles")
        .select("user_id");
      if (profErr) throw profErr;
      userIds = (profiles ?? []).map((p) => p.user_id).filter(Boolean) as string[];
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date();
    const dayDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const subject = `Your Aura intelligence brief · ${dayDate}`;

    let sentCount = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const userId of userIds) {
      try {
        // 1. Email from auth.users
        const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
        if (userErr || !userRes?.user?.email) {
          errors.push({ user_id: userId, error: "no auth user/email" });
          continue;
        }
        const email = userRes.user.email;

        // 2. Profile
        const { data: profile } = await admin
          .from("diagnostic_profiles")
          .select("first_name, firm, sector_focus, notification_prefs")
          .eq("user_id", userId)
          .maybeSingle();

        const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
        // 3. Skip if email_weekly_brief explicitly false
        if (prefs.email_weekly_brief === false) {
          continue;
        }

        const firstName = (profile?.first_name as string | undefined)?.trim()
          || (email.split("@")[0] ?? "there");

        // 4. Top 3 unread notifications, last 7d, ordered by type priority
        const { data: events } = await admin
          .from("notification_events")
          .select("type, title, body, sent_at")
          .eq("user_id", userId)
          .eq("read", false)
          .gte("sent_at", sevenDaysAgo)
          .in("type", ["timing_window", "silence_alarm", "signal_shift"]);

        const order: Record<string, number> = { timing_window: 0, silence_alarm: 1, signal_shift: 2 };
        const sortedEvents = (events ?? [])
          .slice()
          .sort((a, b) => {
            const oa = order[a.type] ?? 99;
            const ob = order[b.type] ?? 99;
            if (oa !== ob) return oa - ob;
            return new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime();
          })
          .slice(0, 3)
          .map((e) => ({
            type: e.type as string,
            title: (e.title as string) ?? "Update",
            body: (e.body as string) ?? "",
          }));

        // 5. Top signal
        const { data: topSignal } = await admin
          .from("strategic_signals")
          .select("signal_title, confidence")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(1)
          .maybeSingle();

        const topSignalTitle = (topSignal?.signal_title as string | undefined) ?? null;
        const topConfidencePct = topSignal?.confidence != null
          ? Math.round(Number(topSignal.confidence) * 100)
          : null;

        // 6. Latest authority score (fetched per spec — included in logs for future use)
        const { data: authority } = await admin
          .from("authority_scores")
          .select("authority_score, momentum_score, engagement_score, snapshot_date")
          .eq("user_id", userId)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (authority) {
          console.log("authority loaded for", userId, authority);
        }

        const html = buildHtml({
          firstName,
          dayDate,
          alerts: sortedEvents,
          topSignalTitle,
          topSignalConfidencePct: topConfidencePct,
        });

        // Send via Resend
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <invites@aura-intel.org>",
            to: [email],
            subject,
            html,
          }),
        });

        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend send failed for", userId, resendRes.status, errText);
          errors.push({ user_id: userId, error: `resend ${resendRes.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        // Log notification_events row
        await admin.from("notification_events").insert({
          user_id: userId,
          type: "weekly_brief",
          channel: "email",
          title: "Weekly brief sent",
          body: subject,
          read: true,
          read_at: new Date().toISOString(),
          metadata: {
            alerts_count: sortedEvents.length,
            top_signal: topSignalTitle,
          },
        });

        sentCount += 1;
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error("send-weekly-brief failure for", userId, msg);
        errors.push({ user_id: userId, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent_count: sentCount, attempted: userIds.length, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-weekly-brief fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});