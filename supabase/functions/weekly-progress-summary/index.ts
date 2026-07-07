import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = !!serviceKey && (bearer === serviceKey || apiKeyHeader === serviceKey);
    if (!isCron && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all users with diagnostic profiles.
    const { data: profiles } = await supabase
      .from("diagnostic_profiles")
      .select("user_id, north_star_goal");

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No users to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifications: any[] = [];
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    for (const profile of profiles) {
      const userId = profile.user_id;

      // Current model: imprint + week-over-week delta, plus this-week captures and posts.
      const [
        { data: latestSnap },
        { data: priorSnap },
        { count: capturesCount },
        { count: postsCount },
      ] = await Promise.all([
        supabase
          .from("imprint_snapshots")
          .select("imprint, components")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("imprint_snapshots")
          .select("imprint")
          .eq("user_id", userId)
          .lte("created_at", sevenDaysAgoIso)
          .gte("created_at", fourteenDaysAgoIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", sevenDaysAgoIso),
        supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("tracking_status", "published")
          .gte("published_at", sevenDaysAgoIso),
      ]);

      const imprint = Math.round(Number((latestSnap as any)?.imprint ?? 0));
      const priorImprint = Math.round(Number((priorSnap as any)?.imprint ?? imprint));
      const delta = imprint - priorImprint;
      const captures = Number(capturesCount ?? 0);
      const posts = Number(postsCount ?? 0);

      // Skip users with zero activity AND zero imprint — don't spam empty accounts.
      if (imprint === 0 && captures === 0 && posts === 0) continue;

      const deltaLabel = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : "steady";
      const capturesLabel = `${captures} capture${captures === 1 ? "" : "s"}`;
      const postsLabel = `${posts} post${posts === 1 ? "" : "s"} published`;
      const goalLine = profile.north_star_goal
        ? ` Keep pushing toward: "${profile.north_star_goal}".`
        : "";

      const title = "Your week in Aura";
      const body = `Imprint ${imprint} (${deltaLabel} vs last week) · ${capturesLabel} · ${postsLabel}.${goalLine}`;

      notifications.push({
        user_id: userId,
        title,
        body,
        type: "weekly_summary",
        metadata: { imprint, delta, captures, posts },
      });
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(JSON.stringify({ sent: notifications.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating weekly summaries:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
