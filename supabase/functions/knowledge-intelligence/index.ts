import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = user.id;

    // Fetch all sources in parallel
    const [entriesRes, docsRes, frameworksRes, evidenceRes, snapshotsRes, intelligenceRes] = await Promise.all([
      supabase.from("entries").select("id, type, content, title, skill_pillar, summary, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
      supabase.from("documents").select("id, filename, summary, file_type, created_at").eq("user_id", userId).limit(50),
      supabase.from("master_frameworks").select("id, title, summary, tags, framework_steps, created_at").eq("user_id", userId).limit(50),
      supabase.from("evidence_fragments").select("id, title, fragment_type, skill_pillars, tags, content, confidence, created_at").eq("user_id", userId).limit(200),
      supabase.from("influence_snapshots").select("authority_themes, tone_analysis, format_breakdown, authority_trajectory, post_count, engagement_rate, snapshot_date").eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(10),
      supabase.from("learned_intelligence").select("id, title, intelligence_type, skill_pillars, tags, content, created_at").eq("user_id", userId).limit(100),
    ]);

    const entries = entriesRes.data || [];
    const documents = docsRes.data || [];
    const frameworks = frameworksRes.data || [];
    const evidence = evidenceRes.data || [];
    const snapshots = snapshotsRes.data || [];
    const intelligence = intelligenceRes.data || [];

    // Source distribution
    const sourceStats = {
      linkedin_posts: entries.filter(e => e.type === "linkedin" || e.type === "linkedin_post").length,
      quick_captures: entries.filter(e => e.type === "quick" || e.type === "capture" || e.type === "text").length,
      voice_insights: entries.filter(e => e.type === "voice" || e.type === "audio").length,
      research_notes: entries.filter(e => e.type === "research" || e.type === "note" || e.type === "link").length,
      draft_content: entries.filter(e => e.type === "draft" || e.type === "article").length,
      uploaded_documents: documents.length,
      strategic_frameworks: frameworks.length,
      evidence_fragments: evidence.length,
      learned_intelligence: intelligence.length,
    };

    const totalSources = Object.values(sourceStats).reduce((s, v) => s + v, 0);

    if (totalSources < 3) {
      return new Response(JSON.stringify({
        authority_themes: [],
        pipeline_stats: sourceStats,
        total_sources: totalSources,
        message: "Capture more insights across different sources to generate authority themes. At least 3 items needed.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build context for AI
    const entryContext = entries.slice(0, 80).map(e => ({
      type: e.type,
      title: e.title || "",
      pillar: e.skill_pillar || "",
      summary: (e.summary || e.content || "").slice(0, 200),
    }));

    const frameworkContext = frameworks.map(f => ({
      title: f.title,
      tags: f.tags,
      summary: (f.summary || "").slice(0, 150),
    }));

    const evidenceContext = evidence.slice(0, 60).map(e => ({
      type: e.fragment_type,
      title: e.title,
      pillars: e.skill_pillars,
      tags: e.tags,
    }));

    const linkedinContext = snapshots.length > 0 ? {
      themes: snapshots[0].authority_themes || [],
      trajectory: snapshots[0].authority_trajectory || null,
      tones: snapshots[0].tone_analysis || [],
      formats: snapshots[0].format_breakdown || {},
      posts: snapshots[0].post_count || 0,
      engagement: snapshots[0].engagement_rate || 0,
    } : null;

    const docContext = documents.map(d => ({
      filename: d.filename,
      summary: (d.summary || "").slice(0, 150),
      type: d.file_type,
    }));

    const intelligenceContext = intelligence.slice(0, 30).map(i => ({
      title: i.title,
      type: i.intelligence_type,
      pillars: i.skill_pillars,
      tags: i.tags,
    }));

    // Call AI for theme detection
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: corsHeaders });
    }

    const prompt = `You are a strategic intelligence analyst for an expert building professional authority.

Analyze ALL sources below to identify authority themes — recurring patterns of expertise that appear across multiple content types.

SOURCES:
Entries (${entries.length}): ${JSON.stringify(entryContext)}
Documents (${documents.length}): ${JSON.stringify(docContext)}
Frameworks (${frameworks.length}): ${JSON.stringify(frameworkContext)}
Evidence fragments (${evidence.length}): ${JSON.stringify(evidenceContext)}
Learned intelligence (${intelligence.length}): ${JSON.stringify(intelligenceContext)}
LinkedIn validation: ${JSON.stringify(linkedinContext)}

For each authority theme you detect:
1. Name the theme clearly (e.g., "Digital Transformation in Energy")
2. Count evidence from EACH source type
3. Assess confidence (high/medium/low) based on volume and consistency
4. Note if LinkedIn validates the theme (audience resonance)
5. Identify the strategic stage: dominant, emerging, or nascent

Also detect:
- Repeated strategic topics across sources
- Industry focus areas
- Tone patterns (from content style)
- Framework structures the user gravitates toward
- Language signals (recurring phrases, terminology)

Return a JSON object using the generate_knowledge_intelligence tool.`;

    const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a strategic intelligence analyst. Always use the provided tool to return structured data." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_knowledge_intelligence",
            description: "Generate structured knowledge intelligence analysis",
            parameters: {
              type: "object",
              properties: {
                authority_themes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      stage: { type: "string", enum: ["dominant", "emerging", "nascent"] },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                      description: { type: "string" },
                      evidence_count: { type: "number" },
                      source_distribution: {
                        type: "object",
                        properties: {
                          linkedin_posts: { type: "number" },
                          quick_captures: { type: "number" },
                          documents: { type: "number" },
                          research_notes: { type: "number" },
                          voice_insights: { type: "number" },
                          draft_content: { type: "number" },
                          frameworks: { type: "number" },
                        },
                      },
                      linkedin_validated: { type: "boolean" },
                      linkedin_signal: { type: "string" },
                    },
                    required: ["name", "stage", "confidence", "description", "evidence_count", "source_distribution"],
                  },
                },
                industry_focus: {
                  type: "array",
                  items: { type: "object", properties: { industry: { type: "string" }, strength: { type: "string" } }, required: ["industry", "strength"] },
                },
                tone_patterns: {
                  type: "array",
                  items: { type: "object", properties: { tone: { type: "string" }, frequency: { type: "string" }, effectiveness: { type: "string" } }, required: ["tone", "frequency"] },
                },
                language_signals: {
                  type: "array",
                  items: { type: "object", properties: { signal: { type: "string" }, context: { type: "string" } }, required: ["signal", "context"] },
                },
                strategic_identity_summary: { type: "string" },
                pipeline_recommendation: { type: "string" },
              },
              required: ["authority_themes", "strategic_identity_summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_knowledge_intelligence" } },
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiResponse.json();
    let result: any = {};

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    }

    return new Response(JSON.stringify({
      ...result,
      pipeline_stats: sourceStats,
      total_sources: totalSources,
      linkedin_active: snapshots.length > 0,
      generated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Knowledge intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
