import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firm, level, core_practice, sector_focus, north_star_goal, years_experience, leadership_style } = await req.json();

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const systemPrompt = `You are an elite executive competency architect with deep expertise in McKinsey, BCG, Bain (MBB) leadership competency models and the Korn Ferry Leadership Architect framework.

Your task: Given a consulting professional's profile, generate the TOP 10 most critical skills they need to master for their 24-month career trajectory.

Rules:
- Use MBB Partner/Director competency frameworks and Korn Ferry's 38 competency model as your foundation
- Skills must be specific and measurable, not generic
- Rank them 1-10 by strategic importance for their specific target role
- Each skill must include a brief description of WHY it matters for their trajectory
- Consider their firm culture, level, practice area, and sector when selecting skills
- Output valid JSON only

Output format:
{
  "skills": [
    {
      "rank": 1,
      "name": "Skill Name",
      "category": "Strategic|Commercial|Leadership|Technical|Relational",
      "description": "Why this skill is critical for their trajectory",
      "korn_ferry_alignment": "Corresponding Korn Ferry competency"
    }
  ],
  "profile_summary": "A 2-sentence executive summary of this person's development path"
}`;

    const userPrompt = `Generate the Top 10 skills for this executive:

- Firm Type: ${firm || "Not specified"}
- Current Level: ${level || "Not specified"}
- Core Practice: ${core_practice || "Not specified"}
- Sector Focus: ${sector_focus || "Not specified"}
- Years of Experience: ${years_experience || "Not specified"}
- Leadership Style: ${leadership_style || "Not specified"}
- 24-Month North Star Goal: ${north_star_goal || "Not specified"}`;

    const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-skill-profile error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
