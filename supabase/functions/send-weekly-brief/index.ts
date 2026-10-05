import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { applyPublishedFilter, filterPublishedRows } from "../_shared/postProvenance.ts";
import { weeklyBriefEmail, dayDateAr, type WeeklyOpts } from "../_shared/scheduledEmails.ts";
import { resolveEmailLang } from "../_shared/emailLang.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://www.aura-intel.org";

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstSentence(s: string | null | undefined): string {
  if (!s) return "";
  const trimmed = s.trim();
  const m = trimmed.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : trimmed).trim();
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


    let targetUserId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.user_id === "string") targetUserId = body.user_id;
      } catch {
        // no body — process all users
      }
    }
    if (!isCron && !isServiceRole) {
      targetUserId = authedUserId;
    }

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

    let sentCount = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    /**
     * Local-time parts for a member's own timezone. Null/invalid falls back to
     * Riyadh, so a member who never set one keeps today's behaviour.
     */
    const WEEKDAY_INDEX: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    function localParts(tz: string | null | undefined, at: Date): { weekday: number; hour: number; dateKey: string } {
      const zone = tz && String(tz).trim() ? String(tz).trim() : "Asia/Riyadh";
      const build = (z: string) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: z, weekday: "short", hour: "2-digit", hour12: false,
          year: "numeric", month: "2-digit", day: "2-digit",
        }).formatToParts(at);
      let parts: Intl.DateTimeFormatPart[];
      try { parts = build(zone); } catch { parts = build("Asia/Riyadh"); }
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const hourRaw = get("hour");
      return {
        weekday: WEEKDAY_INDEX[get("weekday").slice(0, 3)] ?? 0,
        hour: hourRaw === "24" ? 0 : parseInt(hourRaw, 10) || 0,
        dateKey: `${get("year")}-${get("month")}-${get("day")}`,
      };
    }

    for (const userId of userIds) {
      try {
        const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
        if (userErr || !userRes?.user?.email) {
          errors.push({ user_id: userId, error: "no auth user/email" });
          continue;
        }
        const email = userRes.user.email;

        const { data: profile } = await admin
          .from("diagnostic_profiles")
          .select("first_name, firm, sector_focus, notification_prefs, timezone")
          .eq("user_id", userId)
          .maybeSingle();

        const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
        if (prefs.email_weekly_brief === false) {
          continue;
        }

        // Monday 07:00 where the member actually is. Safe to run hourly:
        // every other hour falls straight through with no send and no log.
        const lp = localParts(profile?.timezone as string | null | undefined, now);
        if (!(lp.weekday === 1 && lp.hour === 7)) continue;

        const wkKey = `weekly_brief:${lp.dateKey}`;
        const { data: wkAlready } = await admin
          .from("lifecycle_email_log")
          .select("user_id")
          .eq("message_key", wkKey)
          .eq("user_id", userId)
          .maybeSingle();
        if (wkAlready) continue;

        const firstName = (profile?.first_name as string | undefined)?.trim()
          || (email.split("@")[0] ?? "there");

        // Top signals (now include strategic_implications for "Why now")
        const { data: topSignalsRows } = await admin
          .from("strategic_signals")
          .select("id, signal_title, confidence, strategic_implications")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(3);

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
            id: s.id as string,
            title: s.signal_title as string,
            currentPct,
            deltaPct: currentPct - priorPct,
            whyNow: firstSentence(s.strategic_implications as string | null),
          };
        });
        const topSignalTitle = topSignals[0]?.title ?? null;

        // The draft prepare-weekly-drafts already wrote for this member this week.
        // Never invent a post here: an email may only promise what actually exists.
        let readyPost: { id: string; body: string } | null = null;
        try {
          const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: preparedRows } = await admin
            .from("content_items")
            .select("id, body, created_at")
            .eq("user_id", userId)
            .eq("status", "draft")
            .eq("generation_params->>source", "weekly_ready")
            .gte("created_at", weekAgoIso)
            .order("created_at", { ascending: false })
            .limit(1);
          const prepared = (preparedRows || [])[0] as any;
          if (prepared?.id && String(prepared.body || "").trim()) {
            readyPost = { id: prepared.id as string, body: String(prepared.body) };
          }
        } catch (e) {
          console.warn("weekly brief: prepared draft lookup failed", (e as Error).message);
        }

        // Publishing cadence
        const oneWeekAgoIso = sevenDaysAgo;
        const twoWeeksAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const [thisWeekRes, lastWeekRes] = await Promise.all([
          applyPublishedFilter(
            (admin
              .from("linkedin_posts")
              .select("source_type, tracking_status, published_at")
              .eq("user_id", userId)
              .gte("published_at", oneWeekAgoIso) as any),
          ),
          applyPublishedFilter(
            (admin
              .from("linkedin_posts")
              .select("source_type, tracking_status, published_at")
              .eq("user_id", userId)
              .gte("published_at", twoWeeksAgoIso)
              .lt("published_at", oneWeekAgoIso) as any),
          ),
        ]);
        const postsThisWeek = filterPublishedRows(
          ((thisWeekRes as any).data as any[]) || [],
        ).length;
        const postsLastWeek = filterPublishedRows(
          ((lastWeekRes as any).data as any[]) || [],
        ).length;

        // Capture rhythm — distinct active weeks in last 12
        const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 86400000);
        const { data: rhythmEntries } = await admin
          .from("entries")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", twelveWeeksAgo.toISOString());
        let activeWeeks = 0;
        for (let i = 0; i < 12; i++) {
          const wkEnd = new Date(Date.now() - i * 7 * 86400000);
          const wkStart = new Date(wkEnd.getTime() - 7 * 86400000);
          if ((rhythmEntries || []).some((e: any) => {
            const t = new Date(e.created_at).getTime();
            return t >= wkStart.getTime() && t < wkEnd.getTime();
          })) activeWeeks++;
        }

        // Market pulse — most recent industry_trends, else top signal implication
        const { data: latestTrend } = await admin
          .from("industry_trends")
          .select("headline, url, source")
          .eq("user_id", userId)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let marketPulse: WeeklyOpts["marketPulse"] = null;
        if (latestTrend?.headline) {
          marketPulse = {
            headline: latestTrend.headline as string,
            url: (latestTrend.url as string | null) || null,
            isExternal: true,
          };
        } else if (topSignals[0]) {
          const impl = firstSentence((topSignalsRows?.[0] as any)?.strategic_implications);
          if (impl) marketPulse = { headline: impl, url: null, isExternal: false };
        }

        // Worth reading — most recent industry_trends not yet captured
        let worthReading: WeeklyOpts["worthReading"] = null;
        const { data: candidateTrends } = await admin
          .from("industry_trends")
          .select("headline, url, source, summary, insight, fetched_at")
          .eq("user_id", userId)
          .not("url", "is", null)
          .order("fetched_at", { ascending: false })
          .limit(10);
        if (candidateTrends && candidateTrends.length) {
          const urls = candidateTrends.map((t: any) => t.url).filter(Boolean);
          const { data: capturedRows } = await admin
            .from("entries")
            .select("image_url")
            .eq("user_id", userId)
            .in("image_url", urls);
          const captured = new Set((capturedRows || []).map((r: any) => r.image_url));
          const pick: any = candidateTrends.find((t: any) => t.url && !captured.has(t.url));
          if (pick) {
            worthReading = {
              title: pick.headline as string,
              url: pick.url as string,
              author: (pick.source as string | null) || null,
              readMinutes: 5,
              why: firstSentence(pick.insight || pick.summary || "") || null,
            };
          }
        }

        // The reader's language: the member's saved interface language, else English.
        const lang = await resolveEmailLang(undefined, admin, userId);
        const { subject, html } = weeklyBriefEmail({
          firstName,
          dayDate: lang === "ar" ? dayDateAr(now) : dayDate,
          topSignals,
          postsThisWeek: postsThisWeek ?? 0,
          postsLastWeek: postsLastWeek ?? 0,
          activeWeeks,
          emailParam: email,
          marketPulse,
          worthReading,
          readyPost,
        }, lang);

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "KnownBy <Mohammad.Mahafdhah@aura-intel.org>",
            reply_to: "mohammad.mahafdhah@aura-intel.org",
            to: [email],
            subject,
            html,
            tags: [
              { name: "user_id", value: String(userId) },
              { name: "email_type", value: "weekly_brief" },
            ],
          }),
        });

        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend send failed for", userId, resendRes.status, errText);
          errors.push({ user_id: userId, error: `resend ${resendRes.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        // Only AFTER a successful send do we burn the idempotency key.
        await admin.from("lifecycle_email_log").insert({ user_id: userId, message_key: wkKey });

        await admin.from("notification_events").insert({
          user_id: userId,
          type: "weekly_brief",
          channel: "email",
          title: "Weekly brief sent",
          body: subject,
          read: true,
          read_at: new Date().toISOString(),
          metadata: {
            top_signal: topSignalTitle,
            active_weeks: activeWeeks,
            posts_this_week: postsThisWeek ?? 0,
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
