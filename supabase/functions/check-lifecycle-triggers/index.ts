import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") ||
    (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isServiceRole = !!SERVICE_KEY && apiKey === SERVICE_KEY;
  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const results: any[] = [];

  try {
    const { data: profiles } = await admin
      .from("diagnostic_profiles")
      .select("user_id, created_at");

    const now = Date.now();
    const dayMs = 86400000;

    const { data: allEmails } = await admin
      .from("lifecycle_emails")
      .select("user_id, email_type, sent_at");
    const sentMap = new Map<string, { type: string; sent_at: string }[]>();
    for (const r of allEmails || []) {
      const arr = sentMap.get(r.user_id as string) || [];
      arr.push({ type: r.email_type as string, sent_at: r.sent_at as string });
      sentMap.set(r.user_id as string, arr);
    }

    for (const p of profiles || []) {
      const userId = p.user_id as string;
      const created = new Date(p.created_at as string).getTime();
      const ageDays = Math.floor((now - created) / dayMs);
      const sent = sentMap.get(userId) || [];
      const has = (t: string) => sent.some((s) => s.type === t);

      const toSend: string[] = [];
      if (ageDays === 1 && !has("day1")) toSend.push("day1");
      if (ageDays === 3 && !has("day3")) toSend.push("day3");
      if (ageDays === 7 && !has("day7")) toSend.push("day7");

      // Inactive: last entry >= 5d ago, no inactive in last 7d
      const lastInactive = sent
        .filter((s) => s.type === "inactive")
        .map((s) => new Date(s.sent_at).getTime())
        .sort((a, b) => b - a)[0];
      const recentInactive = lastInactive && now - lastInactive < 7 * dayMs;

      if (!recentInactive) {
        const { data: lastEntry } = await admin
          .from("entries")
          .select("created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastEntry?.created_at) {
          const lastTs = new Date(lastEntry.created_at as string).getTime();
          if (now - lastTs >= 5 * dayMs) toSend.push("inactive");
        }
      }

      // Post ready but not published — nudge after 24h (window 24-48h)
      const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

      const { data: unpublishedPost } = await admin
        .from("linkedin_posts")
        .select("id, post_text, source_signal_id")
        .eq("user_id", userId)
        .eq("source_type", "aura_generated")
        .or("tracking_status.eq.draft,tracking_status.is.null")
        .gte("created_at", fortyEightHoursAgo)
        .lte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (unpublishedPost) {
        const recentPostReady = sent.some(
          (s) => s.type === "post_ready" && now - new Date(s.sent_at).getTime() < 2 * dayMs,
        );
        if (!recentPostReady) {
          let postTitle = (unpublishedPost.post_text as string | null)?.slice(0, 50) + "..." || "your latest insight";
          if (unpublishedPost.source_signal_id) {
            const { data: sig } = await admin
              .from("strategic_signals")
              .select("signal_title")
              .eq("id", unpublishedPost.source_signal_id)
              .maybeSingle();
            if ((sig as any)?.signal_title) postTitle = (sig as any).signal_title;
          }
          const postPreview = (unpublishedPost.post_text as string | null)?.slice(0, 120) || "";
          try {
            const r = await admin.functions.invoke("send-lifecycle-email", {
              body: {
                user_id: userId,
                email_type: "post_ready",
                post_id: unpublishedPost.id,
                post_title: postTitle,
                post_preview: postPreview,
              },
            });
            results.push({ user_id: userId, type: "post_ready", ok: !r.error });
          } catch (e: any) {
            results.push({ user_id: userId, type: "post_ready", ok: false, error: e?.message });
          }
        }
      }

      for (const type of toSend) {
        try {
          const r = await admin.functions.invoke("send-lifecycle-email", {
            body: { user_id: userId, email_type: type },
          });
          results.push({ user_id: userId, type, ok: !r.error });
        } catch (e: any) {
          results.push({ user_id: userId, type, ok: false, error: e?.message });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("check-lifecycle-triggers error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});