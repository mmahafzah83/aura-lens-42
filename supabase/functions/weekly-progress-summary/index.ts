import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all users with diagnostic profiles
    const { data: profiles } = await supabase
      .from("diagnostic_profiles")
      .select("user_id, north_star_goal, skill_ratings, generated_skills, brand_pillars");

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No users to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifications: any[] = [];

    for (const profile of profiles) {
      const userId = profile.user_id;

      // Gather KPI data
      const [
        { data: entries },
        { data: intelligence },
        { data: frameworks },
        { data: trainingLogs },
      ] = await Promise.all([
        supabase.from("entries").select("id, has_strategic_insight, created_at").eq("user_id", userId),
        supabase.from("learned_intelligence").select("id, created_at").eq("user_id", userId),
        supabase.from("master_frameworks").select("id").eq("user_id", userId),
        supabase.from("training_logs").select("id, duration_hours, created_at").eq("user_id", userId),
      ]);

      // Calculate KPIs
      const ratings = (profile.skill_ratings as Record<string, number>) || {};
      const ratingValues = Object.values(ratings).filter((v): v is number => typeof v === "number");
      const avgRating = ratingValues.length > 0 ? Math.round(ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) : 0;
      const frameworkBonus = Math.min((frameworks || []).length * 5, 20);
      const authorityIndex = Math.min(100, avgRating + frameworkBonus);

      const strategicEntries = (entries || []).filter((e: any) => e.has_strategic_insight).length;
      const totalEntries = (entries || []).length;
      const marketVoice = totalEntries > 0
        ? Math.min(100, Math.round((strategicEntries / Math.max(totalEntries, 1)) * 100) + Math.min(totalEntries * 2, 30))
        : 0;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weeklyIntel = (intelligence || []).filter((i: any) => new Date(i.created_at) >= sevenDaysAgo).length;
      const weeklyTraining = (trainingLogs || []).filter((t: any) => new Date(t.created_at) >= sevenDaysAgo);
      const weeklyHours = weeklyTraining.reduce((sum: number, t: any) => sum + Number(t.duration_hours || 0), 0);

      // Build summary
      const highlights: string[] = [];
      if (weeklyIntel > 0) highlights.push(`${weeklyIntel} new intelligence items captured`);
      if (weeklyHours > 0) highlights.push(`${weeklyHours.toFixed(1)}h training logged`);
      if (authorityIndex >= 70) highlights.push(`Authority Index at ${authorityIndex}%`);
      if (marketVoice >= 50) highlights.push(`Market Voice score: ${marketVoice}%`);

      const title = `Weekly Progress — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      const body = highlights.length > 0
        ? `This week: ${highlights.join(" · ")}. ${profile.north_star_goal ? `Keep pushing toward: "${profile.north_star_goal}"` : "Keep building momentum!"}`
        : `No activity this week. Your North Star awaits — log training or capture insights to keep growing.`;

      notifications.push({
        user_id: userId,
        title,
        body,
        type: "weekly_summary",
        metadata: { authority_index: authorityIndex, market_voice: marketVoice, weekly_intel: weeklyIntel, weekly_hours: weeklyHours },
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
