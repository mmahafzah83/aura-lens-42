import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseAiJson(raw: string): any {
  try { return JSON.parse(raw); } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = (match ? match[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " ");
    return JSON.parse(cleaned);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch recent data in parallel
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoWeek = sevenDaysAgo.toISOString();

    const [entriesRes, fragmentsRes, signalsRes, frameworksRes, profileRes] = await Promise.all([
      admin.from("entries").select("title, summary, type, skill_pillar, created_at")
        .eq("user_id", user_id).gte("created_at", isoWeek).order("created_at", { ascending: false }).limit(15),
      admin.from("evidence_fragments").select("title, content, fragment_type, skill_pillars, tags, confidence")
        .eq("user_id", user_id).gte("created_at", isoWeek).order("confidence", { ascending: false }).limit(30),
      admin.from("strategic_signals").select("signal_title, explanation, framework_opportunity, content_opportunity, consulting_opportunity, confidence")
        .eq("user_id", user_id).eq("status", "active").order("confidence", { ascending: false }).limit(5),
      admin.from("master_frameworks").select("title, summary, tags")
        .eq("user_id", user_id).order("created_at", { ascending: false }).limit(5),
      admin.from("diagnostic_profiles").select("generated_skills, skill_ratings, sector_focus, north_star_goal")
        .eq("user_id", user_id).maybeSingle(),
    ]);

    const entries = entriesRes.data || [];
    const fragments = fragmentsRes.data || [];
    const signals = signalsRes.data || [];
    const frameworks = frameworksRes.data || [];
    const profile = profileRes.data as any;

    const contextParts: string[] = [];

    if (entries.length > 0) {
      contextParts.push("RECENT CAPTURES:\n" + entries.map((e: any, i: number) =>
        `${i+1}. [${e.type}] ${e.title || "Untitled"}: ${(e.summary || "").slice(0, 100)}`
      ).join("\n"));
    }

    if (fragments.length > 0) {
      contextParts.push("EVIDENCE FRAGMENTS:\n" + fragments.map((f: any, i: number) =>
        `${i+1}. (${f.fragment_type}) ${f.title}: ${f.content.slice(0, 80)} [${(f.skill_pillars||[]).join(",")}]`
      ).join("\n"));
    }

    if (signals.length > 0) {
      contextParts.push("ACTIVE SIGNALS:\n" + signals.map((s: any, i: number) =>
        `${i+1}. ${s.signal_title}: ${s.explanation?.slice(0, 100)}`
      ).join("\n"));
    }

    if (frameworks.length > 0) {
      contextParts.push("FRAMEWORKS:\n" + frameworks.map((f: any) => f.title).join(", "));
    }

    if (contextParts.length === 0) {
      return new Response(JSON.stringify({ briefing: null, message: "Not enough data for a briefing yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileContext = profile
      ? `Sector: ${profile.sector_focus || "N/A"}, Goal: ${profile.north_star_goal || "N/A"}`
      : "";

    const systemPrompt = `You are Aura, an elite strategic advisor for a senior consulting Director.
Synthesize the user's recent activity into a concise daily strategic briefing.

${profileContext}

Output valid JSON with this structure:
{
  "date": "today's date as Month Day, Year",
  "headline": "One bold sentence summarizing the day's strategic theme (max 15 words)",
  "strategic_signal": {
    "title": "Pattern title (5-8 words)",
    "description": "2 sentences on the detected pattern"
  },
  "framework_opportunity": {
    "title": "Proposed framework name",
    "description": "1 sentence on what framework could be built"
  },
  "authority_opportunity": {
    "title": "Thought leadership topic",
    "hook": "One-line hook for a LinkedIn post"
  },
  "recommended_action": {
    "action": "Specific next step (1 sentence, imperative)",
    "rationale": "Why this matters (1 sentence)"
  }
}

Be bold, specific, and Director-level. No generic advice.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate today's strategic briefing from:\n\n${contextParts.join("\n\n")}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const briefing = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");

    return new Response(JSON.stringify({ briefing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("strategic-briefing error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
