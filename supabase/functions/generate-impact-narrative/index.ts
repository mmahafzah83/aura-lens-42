import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const PROMPT_VERSION = "v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    const {
      score, tierName, weekDelta, selectedDays,
      followers, impressions, engagementRate,
      impChange, engChange, followerChange,
      newFollowers, bestDay,
      signalScore, contentScore, consistencyScore,
      visibility, resonance, signalDepth, momentum,
      topSignal, postCount, avgPostEngagement,
      topPosts,
    } = body;

    const hashInput = JSON.stringify({
      score, followers, impressions, engagementRate, postCount, selectedDays,
      promptVersion: PROMPT_VERSION,
    });
    const dataHash = hashInput.slice(0, 200);

    const { data: cached } = await admin
      .from("impact_narratives")
      .select("*")
      .eq("user_id", user.id)
      .eq("data_hash", dataHash)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("first_name, level, firm, sector_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    const name = profile?.first_name || "there";

    const topPostsSummary = (topPosts || []).slice(0, 5).map((p: any, i: number) =>
      `#${i + 1}: ${p.date} — ${p.impressions} imp, ${p.reactions} reactions, ${p.rate}% engagement`
    ).join("\n");

    const prompt = `You are a Senior Digital Presence Advisor analyzing a professional's Impact dashboard. Speak directly to ${name} by first name. Be specific — reference exact numbers from the data. Be strategic — explain what the numbers MEAN, not just what they ARE.

DASHBOARD DATA (last ${selectedDays} days):
- Digital presence score: ${score}/100 (${tierName} tier), ${weekDelta > 0 ? "up" : "down"} ${Math.abs(weekDelta)} points this week
- Followers: ${followers} total, +${newFollowers} new this period${followerChange !== null ? `, ${followerChange > 0 ? "+" : ""}${followerChange.toFixed(0)}% vs prior period` : ""}
- Impressions: ${impressions} total${impChange !== null ? `, ${impChange > 0 ? "+" : ""}${impChange.toFixed(0)}% vs prior period` : ""}
- Engagement rate: ${engagementRate}%${engChange !== null ? `, ${engChange > 0 ? "+" : ""}${engChange.toFixed(0)}% vs prior period` : ""}
- Score breakdown: Signal ${signalScore}/40, Content ${contentScore}/40, Consistency ${consistencyScore}/20
- Visibility: ${visibility} avg impressions/post
- Resonance: ${resonance}% engagement (tier benchmark: 1.5-4% for 10K-50K followers)
- Signal depth: ${signalDepth} active signals
- Momentum: ${momentum}/4 weeks active
- Top signal: ${topSignal || "None"}
- Posts analyzed: ${postCount}, avg engagement: ${avgPostEngagement}%
- Best follower day: ${bestDay || "N/A"}

TOP POSTS:
${topPostsSummary || "No post data"}

${profile?.firm ? `Works at: ${profile.firm}` : ""}
${profile?.sector_focus ? `Sector: ${profile.sector_focus}` : ""}

Return ONLY valid JSON:
{
  "hero_narrative": "2-3 sentences. The headline story of this period. Reference the most dramatic number. End with ONE specific action. Use ${name}'s first name.",
  "footprint_insight": "1-2 sentences interpreting Visibility + Resonance + Signal Depth + Momentum together. What pattern do they reveal? What's the strategic gap?",
  "content_insight": "1-2 sentences about publishing patterns. Reference post count, avg engagement, and strongest territory. Compare to what they SHOULD be doing.",
  "post_insight": "1-2 sentences about what the top posts reveal. Which format/topic works? Is there an outlier distorting the picture? What should they write next?",
  "one_action": "One sentence. The single highest-leverage action this week. Be specific — name the topic, the format, or the audience segment."
}

Rules:
- Start hero_narrative with ${name}'s name
- Reference at least one specific number in every field
- Never use: authority, trajectory, personal brand, thought leader, thought leadership, leverage, utilize, facilitate
- Tone: direct, commercial, peer-to-peer — like a board advisor, not a marketing coach
- Write to move a senior leader, not just inform one — name what the numbers reveal about where they stand, with respect and clarity. Never flattery, never alarm, never a coaching or cheerleading tone.
- Plain, human language a busy executive respects. Every claim anchored to a real number from the data.
- Close with one clear, doable next move — direction, not a lecture.
- If engagement is below the tier benchmark, say so directly
- If momentum is low (1/4 or 2/4), name the urgency`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a Senior Digital Presence Advisor. Return ONLY valid JSON. No prose, no code fences." },
          { role: "user", content: prompt }
        ]
      })
    });

    const aiData = await aiRes.json();
    const rawContent = aiData?.choices?.[0]?.message?.content ?? "";

    let narrative: any;
    try {
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      narrative = JSON.parse(cleaned);
    } catch {
      const start = rawContent.indexOf("{");
      const end = rawContent.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { narrative = JSON.parse(rawContent.slice(start, end + 1)); } catch { narrative = null; }
      }
    }

    if (!narrative || !narrative.hero_narrative) {
      return new Response(JSON.stringify({ error: "Failed to generate narrative" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("impact_narratives").delete().eq("user_id", user.id);

    const { data: saved } = await admin
      .from("impact_narratives")
      .insert({
        user_id: user.id,
        hero_narrative: narrative.hero_narrative,
        footprint_insight: narrative.footprint_insight,
        content_insight: narrative.content_insight,
        post_insight: narrative.post_insight,
        one_action: narrative.one_action,
        data_hash: dataHash,
      })
      .select()
      .single();

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-impact-narrative error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});