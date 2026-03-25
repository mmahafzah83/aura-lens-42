import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;

    // Fetch all sources in parallel — including linkedin_posts
    const [entriesRes, docsRes, frameworksRes, evidenceRes, snapshotsRes, intelligenceRes, linkedinPostsRes] = await Promise.all([
      supabase.from("entries").select("id, type, content, title, skill_pillar, summary, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
      supabase.from("documents").select("id, filename, summary, file_type, created_at").eq("user_id", userId).limit(50),
      supabase.from("master_frameworks").select("id, title, summary, tags, framework_steps, created_at").eq("user_id", userId).limit(50),
      supabase.from("evidence_fragments").select("id, title, fragment_type, skill_pillars, tags, content, confidence, created_at").eq("user_id", userId).limit(200),
      supabase.from("influence_snapshots").select("authority_themes, tone_analysis, format_breakdown, authority_trajectory, post_count, engagement_rate, snapshot_date").eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(10),
      supabase.from("learned_intelligence").select("id, title, intelligence_type, skill_pillars, tags, content, created_at").eq("user_id", userId).limit(100),
      supabase.from("linkedin_posts").select("id, post_text, theme, tone, format_type, like_count, comment_count, engagement_score, published_at").eq("user_id", userId).order("published_at", { ascending: false }).limit(100),
    ]);

    const entries = entriesRes.data || [];
    const documents = docsRes.data || [];
    const frameworks = frameworksRes.data || [];
    const evidence = evidenceRes.data || [];
    const snapshots = snapshotsRes.data || [];
    const intelligence = intelligenceRes.data || [];
    const linkedinPosts = linkedinPostsRes.data || [];

    // Source distribution
    const sourceStats = {
      linkedin_posts: linkedinPosts.length || entries.filter(e => e.type === "linkedin" || e.type === "linkedin_post").length,
      quick_captures: entries.filter(e => ["quick", "capture", "text"].includes(e.type)).length,
      voice_insights: entries.filter(e => ["voice", "audio"].includes(e.type)).length,
      research_notes: entries.filter(e => ["research", "note", "link"].includes(e.type)).length,
      draft_content: entries.filter(e => ["draft", "article"].includes(e.type)).length,
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
        linkedin_active: false,
        generated_at: new Date().toISOString(),
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

    const linkedinPostContext = linkedinPosts.slice(0, 40).map(p => ({
      text: (p.post_text || "").slice(0, 200),
      theme: p.theme,
      tone: p.tone,
      format: p.format_type,
      likes: p.like_count,
      comments: p.comment_count,
      engagement: p.engagement_score,
    }));

    const linkedinSnapshotContext = snapshots.length > 0 ? {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `You are a strategic intelligence analyst for an expert building professional authority.

Analyze ALL sources below to build a complete Authority Intelligence Model.

SOURCES:
Entries (${entries.length}): ${JSON.stringify(entryContext)}
Documents (${documents.length}): ${JSON.stringify(docContext)}
Frameworks (${frameworks.length}): ${JSON.stringify(frameworkContext)}
Evidence fragments (${evidence.length}): ${JSON.stringify(evidenceContext)}
Learned intelligence (${intelligence.length}): ${JSON.stringify(intelligenceContext)}
LinkedIn posts (${linkedinPosts.length}): ${JSON.stringify(linkedinPostContext)}
LinkedIn snapshot validation: ${JSON.stringify(linkedinSnapshotContext)}

ANALYSIS REQUIRED:

1. AUTHORITY THEMES — Group signals into 3-7 authority themes. Each theme must cite evidence from specific source types with counts.

2. TONE INTELLIGENCE — Classify writing patterns across ALL sources:
   Visionary, Analytical, Educational, Operational, Opinion-driven.
   When LinkedIn data exists, include effectiveness based on engagement.

3. CONTENT FORMAT INTELLIGENCE — Identify how ideas are presented:
   Insight Post, Framework Breakdown, Case Study, Strategic Commentary, Opinion Piece, etc.
   Note which formats produce stronger engagement if LinkedIn data exists.

4. STRATEGIC AUTHORITY POSITION — A single powerful summary of what this person is becoming known for, based on ALL evidence.

5. STRATEGIC ADVISOR — Generate 3-4 actionable recommendations:
   - Priority topic to publish about
   - Authority theme to reinforce
   - Content format to use
   - Strategic gap to address
   Each recommendation should explain WHY based on evidence.

6. PIPELINE RECOMMENDATION — One insight about the balance of their intelligence pipeline.

Be evidence-based: every claim should trace back to specific sources.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a strategic intelligence analyst. Use the provided tool to return structured data." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_authority_intelligence",
            description: "Generate the complete authority intelligence model",
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
                    additionalProperties: false,
                  },
                },
                tone_intelligence: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tone: { type: "string" },
                      frequency: { type: "string", enum: ["dominant", "frequent", "occasional", "rare"] },
                      effectiveness: { type: "string", enum: ["high", "medium", "low", "unknown"] },
                      evidence_source: { type: "string" },
                    },
                    required: ["tone", "frequency", "effectiveness"],
                    additionalProperties: false,
                  },
                },
                content_format_intelligence: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      format: { type: "string" },
                      usage_frequency: { type: "string", enum: ["high", "medium", "low"] },
                      engagement_signal: { type: "string", enum: ["strong", "moderate", "weak", "unknown"] },
                      recommendation: { type: "string" },
                    },
                    required: ["format", "usage_frequency", "engagement_signal"],
                    additionalProperties: false,
                  },
                },
                industry_focus: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      industry: { type: "string" },
                      strength: { type: "string", enum: ["dominant", "emerging", "nascent"] },
                    },
                    required: ["industry", "strength"],
                    additionalProperties: false,
                  },
                },
                language_signals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      signal: { type: "string" },
                      context: { type: "string" },
                    },
                    required: ["signal", "context"],
                    additionalProperties: false,
                  },
                },
                strategic_identity_summary: { type: "string" },
                strategic_advisor: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["publish", "reinforce", "format", "gap"] },
                      title: { type: "string" },
                      rationale: { type: "string" },
                    },
                    required: ["type", "title", "rationale"],
                    additionalProperties: false,
                  },
                },
                pipeline_recommendation: { type: "string" },
              },
              required: ["authority_themes", "strategic_identity_summary", "tone_intelligence", "content_format_intelligence", "strategic_advisor"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_authority_intelligence" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiResponse.text();
      console.error("AI error:", errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      linkedin_active: snapshots.length > 0 || linkedinPosts.length > 0,
      generated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Knowledge intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
