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
  topSignals: Array<{ title: string; currentPct: number; deltaPct: number }>;
  postsThisWeek: number;
  postsLastWeek: number;
  moves: Array<{ title: string; rationale: string }>;
  brand: string;
  brandFont: string;
}): string {
  const { firstName, dayDate, alerts, topSignals, postsThisWeek, postsLastWeek, moves, brand, brandFont } = opts;

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
    : "";

  const signalsHtml = topSignals.length
    ? `<div style="margin:8px 0 22px;">
         <p style="font-size:12px;font-weight:600;color:#888;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Top signals this week</p>
         ${topSignals
           .map((s) => {
             const sign = s.deltaPct > 0 ? "+" : "";
             const deltaColor = s.deltaPct > 0 ? "#16a34a" : s.deltaPct < 0 ? "#dc2626" : "#888";
             const deltaText = s.deltaPct === 0 ? "no change" : `${sign}${s.deltaPct} pts`;
             return `
           <div style="margin-bottom:10px;padding:14px 16px;background:#faf8f4;border-radius:8px;">
             <p style="font-size:14px;font-weight:600;color:#0d0d0d;margin-bottom:4px;">${escapeHtml(s.title)}</p>
             <p style="font-size:12px;color:#555;margin:0;">Confidence <strong style="color:#0d0d0d;">${s.currentPct}%</strong> · <span style="color:${deltaColor};">${deltaText} vs 7d ago</span></p>
           </div>`;
           })
           .join("")}
       </div>`
    : "";

  const pubDelta = postsThisWeek - postsLastWeek;
  const pubDeltaTxt = pubDelta === 0 ? "same as last week" : pubDelta > 0 ? `+${pubDelta} vs last week` : `${pubDelta} vs last week`;
  const publishingHtml = `<div style="margin:8px 0 22px;padding:14px 16px;background:#faf8f4;border-radius:8px;">
         <p style="font-size:12px;font-weight:600;color:#888;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Publishing cadence</p>
         <p style="font-size:14px;color:#0d0d0d;margin:0;"><strong>${postsThisWeek}</strong> post${postsThisWeek === 1 ? "" : "s"} this week · <span style="color:#555;">${escapeHtml(pubDeltaTxt)}</span></p>
       </div>`;

  const movesHtml = moves.length
    ? `<div style="margin:8px 0 22px;">
         <p style="font-size:12px;font-weight:600;color:#888;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Recommended moves</p>
         ${moves
           .map(
             (m) => `
           <div style="margin-bottom:10px;padding:14px 16px;background:#faf8f4;border-radius:8px;border-left:4px solid ${brand};">
             <p style="font-size:14px;font-weight:600;color:#0d0d0d;margin-bottom:4px;">${escapeHtml(m.title)}</p>
             <p style="font-size:13px;line-height:1.6;color:#555;margin:0;">${escapeHtml(m.rationale)}</p>
           </div>`,
           )
           .join("")}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Aura intelligence brief</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background-color:#f0ede8; font-family:'${brandFont}',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
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
      <p style="font-size:13px;color:${brand};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">Aura · Weekly Brief</p>
      <h1 style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:600;color:#f0f0f0;margin-bottom:8px;">Your intelligence brief</h1>
      <p style="font-size:14px;color:#aaa;line-height:1.5;">${escapeHtml(dayDate)}</p>
    </div>

    <div class="content-pad" style="padding:36px 40px;color:#1a1a1a;">
      <p style="font-size:16px;line-height:1.6;margin-bottom:14px;">Good morning, ${escapeHtml(firstName)}.</p>
      <p style="font-size:15px;line-height:1.7;color:#333;margin-bottom:24px;">Here is what shifted in your authority landscape this week.</p>

      ${alertsHtml}
      ${signalsHtml}
      ${publishingHtml}
      ${movesHtml}

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${APP_URL}/home" class="cta-btn" style="display:inline-block;background:${brand};color:#0d0d0d;padding:16px 32px;border-radius:8px;font-weight:700;font-size:15px;">Open Aura →</a>
      </div>
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
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "");
    const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = bearer === SERVICE_ROLE || apiKey === SERVICE_ROLE;

    // Authn: cron / service-role / user JWT
    let authedUserId: string | null = null;
    if (!isCron && !isServiceRole) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authedUserId = user.id;
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch active design system tokens for brand colors / fonts
    const { data: dsRow } = await admin
      .from('design_system')
      .select('tokens')
      .eq('scope', 'global')
      .eq('is_active', true)
      .single();
    const ds = (dsRow?.tokens as any) || {};
    const BRAND = ds?.colors?.brand?.light || '#B08D3A';
    const BRAND_FONT = ds?.typography?.body || 'DM Sans';

    let targetUserId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.user_id === "string") targetUserId = body.user_id;
      } catch {
        // no body — process all users
      }
    }
    // User-scoped callers can only send their own brief.
    if (!isCron && !isServiceRole) {
      targetUserId = authedUserId;
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

        // 5. Top 3 signals + 7-day confidence deltas (snapshot comparison from score_snapshots.components)
        const { data: topSignalsRows } = await admin
          .from("strategic_signals")
          .select("id, signal_title, confidence")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(3);

        // Pull a snapshot from ~7 days ago to compute confidence deltas, if available
        let priorConfidenceById: Record<string, number> = {};
        const { data: priorSnapshot } = await admin
          .from("score_snapshots")
          .select("components, created_at")
          .eq("user_id", userId)
          .lte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const priorSignals = (priorSnapshot?.components as any)?.signals;
        if (Array.isArray(priorSignals)) {
          for (const s of priorSignals) {
            if (s?.id && typeof s?.confidence === "number") {
              priorConfidenceById[s.id] = s.confidence;
            }
          }
        }

        const topSignals = (topSignalsRows ?? []).map((s: any) => {
          const currentPct = s.confidence != null ? Math.round(Number(s.confidence) * 100) : 0;
          const prior = priorConfidenceById[s.id];
          const priorPct = prior != null ? Math.round(prior * 100) : currentPct;
          return {
            title: s.signal_title as string,
            currentPct,
            deltaPct: currentPct - priorPct,
          };
        });
        const topSignalTitle = topSignals[0]?.title ?? null;

        // 6. Publishing cadence: posts this week vs last week
        const oneWeekAgoIso = sevenDaysAgo;
        const twoWeeksAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const [{ count: postsThisWeek }, { count: postsLastWeek }] = await Promise.all([
          admin
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("published_at", oneWeekAgoIso),
          admin
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("published_at", twoWeeksAgoIso)
            .lt("published_at", oneWeekAgoIso),
        ]);

        // 7. Recommended moves — up to 2 active
        const nowIso = new Date().toISOString();
        const { data: moveRows } = await admin
          .from("recommended_moves")
          .select("title, rationale, status, expires_at")
          .eq("user_id", userId)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .in("status", ["active", "pending", "open"])
          .order("created_at", { ascending: false })
          .limit(2);
        const moves = (moveRows ?? []).map((m: any) => ({
          title: m.title as string,
          rationale: (m.rationale as string) ?? "",
        }));

        const html = buildHtml({
          firstName,
          dayDate,
          alerts: sortedEvents,
          topSignals,
          postsThisWeek: postsThisWeek ?? 0,
          postsLastWeek: postsLastWeek ?? 0,
          moves,
          brand: BRAND,
          brandFont: BRAND_FONT,
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