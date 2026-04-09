import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Gather existing user data
    const [profileRes, entriesRes, frameworksRes, signalsRes, intelligenceRes, fragmentsRes] = await Promise.all([
      supabase.from("diagnostic_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("entries").select("content, title, type, skill_pillar, framework_tag, account_name").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("master_frameworks").select("title, summary, tags").eq("user_id", user.id).limit(20),
      supabase.from("strategic_signals").select("signal_title, explanation, theme_tags, skill_pillars").eq("user_id", user.id).limit(20),
      supabase.from("learned_intelligence").select("title, intelligence_type, skill_pillars, tags").eq("user_id", user.id).limit(30),
      supabase.from("evidence_fragments").select("title, fragment_type, skill_pillars, tags").eq("user_id", user.id).limit(30),
    ]);

    const profile = profileRes.data;
    const entries = entriesRes.data || [];
    const frameworks = frameworksRes.data || [];
    const signals = signalsRes.data || [];
    const intelligence = intelligenceRes.data || [];
    const fragments = fragmentsRes.data || [];

    const contextSummary = `
PROFILE:
- Firm: ${profile?.firm || "unknown"}
- Level: ${profile?.level || "unknown"}
- Core Practice: ${profile?.core_practice || "unknown"}
- Sector Focus: ${profile?.sector_focus || "unknown"}
- North Star: ${profile?.north_star_goal || "unknown"}
- Brand Pillars: ${(profile?.brand_pillars || []).join(", ")}
- Skills: ${(profile?.generated_skills as any[] || []).map((s: any) => s.name || s).join(", ")}

RECENT CAPTURES (${entries.length}):
${entries.slice(0, 20).map(e => `- [${e.type}] ${e.title || e.content?.substring(0, 100)}`).join("\n")}

FRAMEWORKS (${frameworks.length}):
${frameworks.map(f => `- ${f.title}: ${f.summary || ""} [${(f.tags || []).join(", ")}]`).join("\n")}

STRATEGIC SIGNALS (${signals.length}):
${signals.map(s => `- ${s.signal_title}: ${s.explanation?.substring(0, 100)} [${(s.theme_tags || []).join(", ")}]`).join("\n")}

INTELLIGENCE (${intelligence.length}):
${intelligence.slice(0, 15).map(i => `- ${i.title} (${i.intelligence_type}) [${(i.skill_pillars || []).join(", ")}]`).join("\n")}

EVIDENCE FRAGMENTS (${fragments.length}):
${fragments.slice(0, 15).map(f => `- ${f.title} (${f.fragment_type}) [${(f.tags || []).join(", ")}]`).join("\n")}
`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a senior executive positioning advisor specialising in the GCC market. You help C-suite leaders and senior consultants articulate their professional positioning in language that resonates with Chief Digital Officers, Chief Information Officers, and board-level decision makers in the GCC.

Rules:
- Never use personal branding framework language. Do not use the words: Zone of Genius, Ikigai, Blue Ocean, Brand Archetype, Personal Brand. Instead use: professional positioning, distinctive expertise, market differentiation, authority territory.
- Always anchor outputs to the user's specific sector and geography. If the user works in utilities, every output must reference utilities. If they work in GCC, every output must name the GCC context specifically.
- Authority themes must connect directly to a real market tension the user's target clients face right now. Name the tension explicitly. Then show how the user's expertise resolves it.
- Content pillar titles must be something a CDO would search for on LinkedIn, specific to the user's sector.
- Do not display any capability at 0% unless the user explicitly scored themselves 0. If a capability has no score, show it as 'Not yet assessed'.
- Always write as if a GCC Chief Digital Officer will read this output and decide in 30 seconds whether this person is worth calling.

Analyze the user's data and generate their Executive Positioning Model. Return JSON using the provided tool.`
          },
          {
            role: "user",
            content: `Analyze this executive's data and generate their Executive Positioning Model:\n\n${contextSummary}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_identity",
            description: "Generate a strategic identity model for the user",
            parameters: {
              type: "object",
              properties: {
                primary_role: { type: "string", description: "Primary strategic role e.g. 'AI Strategy Architect'" },
                secondary_strengths: { type: "array", items: { type: "string" }, description: "2-4 secondary strengths" },
                identity_summary: { type: "string", description: "2-3 sentence strategic identity summary" },
                expertise_areas: { type: "array", items: { type: "string" }, description: "5-8 expertise areas" },
                industries: { type: "array", items: { type: "string" }, description: "Industries the user focuses on" },
                knowledge_domains: { type: "array", items: { type: "string" }, description: "Key knowledge domains" },
                values: { type: "array", items: { type: "string" }, description: "Core professional values inferred" },
                authority_ambitions: { type: "array", items: { type: "string" }, description: "Where the user is building authority" },
                strategic_goals: { type: "array", items: { type: "string" }, description: "Inferred strategic goals" },
                authority_themes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      theme: { type: "string" },
                      rationale: { type: "string" }
                    },
                    required: ["theme", "rationale"]
                  },
                  description: "3-5 suggested authority themes with rationale"
                },
                capabilities: { type: "array", items: { type: "string" }, description: "Core capabilities" },
                clients: { type: "array", items: { type: "string" }, description: "Target client types" }
              },
              required: ["primary_role", "secondary_strengths", "identity_summary", "expertise_areas", "industries", "knowledge_domains", "values", "authority_ambitions", "strategic_goals", "authority_themes", "capabilities", "clients"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_identity" } }
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const identityModel = JSON.parse(toolCall.function.arguments);
    identityModel.generated_at = new Date().toISOString();

    // Save to profile
    await supabase
      .from("diagnostic_profiles")
      .update({ identity_intelligence: identityModel } as any)
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ identity: identityModel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Identity intelligence error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
