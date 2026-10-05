import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logError } from "../_shared/logError.ts";
import { lifecycleEmail } from "../_shared/scheduledEmails.ts";
import { resolveEmailLang } from "../_shared/emailLang.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://aura-intel.org";
const FROM = "KnownBy <Mohammad.Mahafdhah@aura-intel.org>";
const FROM_INVITES = "KnownBy <invites@aura-intel.org>";
const REPLY_TO = "mohammad.mahafdhah@aura-intel.org";

type EmailType = "day1" | "day3" | "day7" | "inactive" | "silence" | "post_ready" | "aura_card_ready" | "aura_card_nudge" | "aura_card_monthly";

serve(withObserve("send-lifecycle-email", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") ||
      (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = !!SERVICE_KEY && apiKey === SERVICE_KEY;
    const reqBody = await req.json();
    const { user_id, email_type, post_id, post_title, post_preview, missing_gates, month_name } = reqBody;
    if (!user_id || !email_type) {
      return new Response(JSON.stringify({ error: "user_id and email_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Allow authenticated user to trigger their own "aura_card_*" emails only.
    let isSelfUser = false;
    const SELF_ALLOWED: EmailType[] = ["aura_card_ready", "aura_card_nudge", "aura_card_monthly"];
    if (!isCron && !isServiceRole) {
      if (!SELF_ALLOWED.includes(email_type)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const SUPABASE_URL_A = Deno.env.get("SUPABASE_URL")!;
        const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
        const authHeader = req.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        let claimSub: string | null = null;
        if (token) {
          const userClient = createClient(SUPABASE_URL_A, ANON);
          try {
            const { data: c } = await userClient.auth.getClaims(token);
            claimSub = (c as any)?.claims?.sub ?? null;
          } catch { /* fall through */ }
          if (!claimSub) {
            // Fallback: decode JWT payload sub without verification (verify_jwt=false at platform;
            // we only use it to gate to the caller's own user_id).
            try {
              const parts = token.split(".");
              if (parts.length >= 2) {
                const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
                const json = JSON.parse(atob(b64 + pad));
                claimSub = json?.sub ?? null;
              }
            } catch { /* ignore */ }
          }
        }
        if (!claimSub || claimSub !== user_id) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        isSelfUser = true;
      } catch {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const types: EmailType[] = ["day1", "day3", "day7", "inactive", "silence", "post_ready", "aura_card_ready", "aura_card_nudge", "aura_card_monthly"];
    if (!types.includes(email_type)) {
      return new Response(JSON.stringify({ error: "invalid email_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // De-dupe
    if (email_type === "post_ready") {
      if (post_id) {
        const { data: existingPost } = await admin
          .from("lifecycle_emails")
          .select("id")
          .eq("user_id", user_id)
          .eq("email_type", "post_ready")
          .eq("metadata->>post_id", post_id)
          .limit(1);
        if (existingPost && existingPost.length > 0) {
          return new Response(JSON.stringify({ skipped: "already_sent_for_post" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // Fallback: don't send if any post_ready was sent in last 48h
      const fortyEightHrAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: recentPR } = await admin
        .from("lifecycle_emails")
        .select("id")
        .eq("user_id", user_id)
        .eq("email_type", "post_ready")
        .gte("sent_at", fortyEightHrAgo)
        .limit(1);
      if (recentPR && recentPR.length > 0) {
        return new Response(JSON.stringify({ skipped: "recent_post_ready" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { data: existing } = await admin
        .from("lifecycle_emails")
        .select("id")
        .eq("user_id", user_id)
        .eq("email_type", email_type)
        .limit(1);
      if (existing && existing.length > 0 && email_type !== "inactive" && email_type !== "silence" && email_type !== "aura_card_nudge" && email_type !== "aura_card_monthly") {
        return new Response(JSON.stringify({ skipped: "already_sent" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Recipient email
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(user_id);
    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const recipient = userData.user.email;

    // Profile
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("first_name, sector_focus, level")
      .eq("user_id", user_id)
      .maybeSingle();

    // Entries count
    const { count: entriesCount } = await admin
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id);

    // Signals
    const { data: signals, count: signalCount } = await admin
      .from("strategic_signals")
      .select("id, signal_title, confidence", { count: "exact" })
      .eq("user_id", user_id)
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(3);

    // Fading signals (decaying / dormant — lowest confidence first)
    const { data: fading, count: fadingCount } = await admin
      .from("strategic_signals")
      .select("signal_title, confidence, velocity_status", { count: "exact" })
      .eq("user_id", user_id)
      .in("velocity_status", ["fading", "dormant"])
      .order("confidence", { ascending: true })
      .limit(3);

    // Posts confirmed on LinkedIn in last 30 days (via LinkedIn sync)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // POSTS, not metric rows: linkedin_post_metrics holds one row per snapshot
    // per post, so a raw count says "twelve posts" when there are three.
    // CEILING, NAMED: 5000 snapshot rows. One row per post per day means this
    // covers ~166 posts over a 30-day window; a member above that would be
    // under-reported, so raise this (or move to a distinct-count RPC) if that
    // ever becomes reachable.
    const { data: metricRows } = await admin
      .from("linkedin_post_metrics")
      .select("post_id")
      .eq("user_id", user_id)
      .gte("snapshot_date", thirtyDaysAgo)
      .limit(5000);
    const publishedCount = new Set(
      (metricRows ?? []).map((r: any) => r.post_id).filter(Boolean),
    ).size;

    // Recent trend (last 7 days, not dismissed, top by final_score)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: trendRow } = await admin
      .from("industry_trends")
      .select("headline, source")
      .eq("user_id", user_id)
      .neq("status", "dismissed")
      .gte("fetched_at", sevenDaysAgo)
      .order("final_score", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Latest score
    const { data: snap } = await admin
      .from("score_snapshots")
      .select("score, components")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tier = (snap?.components as any)?.tier_name || (snap?.components as any)?.tier || null;

    // The reader's language: the member's saved interface language, else English.
    const lang = await resolveEmailLang(undefined, admin, user_id);

    const { subject, html } = lifecycleEmail(email_type, {
      firstName: profile?.first_name || "",
      sectorFocus: profile?.sector_focus || null,
      level: (profile as any)?.level || null,
      entriesCount: entriesCount || 0,
      topSignals: (signals as any[]) || [],
      score: snap?.score ?? null,
      tier,
      signalCount: signalCount || 0,
      fadingSignals: (fading as any[]) || [],
      fadingCount: fadingCount || 0,
      publishedCount: publishedCount || 0,
      recentTrend: trendRow ? { headline: (trendRow as any).headline, source: (trendRow as any).source } : null,
      postTitle: post_title || undefined,
      postPreview: post_preview || undefined,
      postId: post_id || undefined,
      missingGates: Array.isArray(missing_gates) ? missing_gates : undefined,
      monthName: typeof month_name === "string" ? month_name : undefined,
    }, lang);

    const fromAddress = (email_type === "aura_card_ready" || email_type === "aura_card_nudge" || email_type === "aura_card_monthly")
      ? FROM_INVITES
      : FROM;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        reply_to: REPLY_TO,
        subject,
        html,
        tags: [
          { name: "user_id", value: String(user_id) },
          { name: "email_type", value: String(email_type).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 250) },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend failed", resendRes.status, errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendInfo = await resendRes.json().catch(() => ({}));

    await admin.from("lifecycle_emails").insert({
      user_id,
      email_type,
      metadata: {
        subject,
        recipient,
        resend_id: (sendInfo as any)?.id || null,
        ...(email_type === "post_ready" && post_id ? { post_id } : {}),
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-lifecycle-email error", e);
    EdgeRuntime.waitUntil(logError("send-lifecycle-email", e, { user_id: null }));
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
