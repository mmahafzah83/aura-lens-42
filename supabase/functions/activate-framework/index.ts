import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function aiGenerate(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI generation failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { framework_id, user_id } = await req.json();
    if (!framework_id || !user_id) throw new Error("framework_id and user_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the framework
    const { data: fw, error: fwErr } = await adminClient
      .from("master_frameworks")
      .select("*")
      .eq("id", framework_id)
      .single();
    if (fwErr || !fw) throw new Error("Framework not found");

    const steps = (fw.framework_steps as any[]) || [];
    const stepsText = steps
      .map((s: any) => `${s.step_number}. ${s.step_title}: ${s.step_description}`)
      .join("\n");

    const frameworkContext = `Framework: "${fw.title}"
Summary: ${fw.summary || "N/A"}
Tags: ${(fw.tags || []).join(", ")}
Steps:
${stepsText}`;

    // Generate all 4 outputs in parallel
    const [linkedinPost, consultingOpp, strategyBrief, slideContent] = await Promise.all([
      // 1. LinkedIn Authority Post
      aiGenerate(
        LOVABLE_API_KEY,
        `You are a thought leadership ghostwriter for a Senior Director at EY specializing in Digital Transformation & Saudi Utility sector (MEWA, NWC, SWA). Write LinkedIn posts using this structure:

HOOK (Lines 1-3): Bold curiosity gap or contrarian insight. Must create a "See more" cliffhanger by line 3.
BODY: Atomic formatting - max 2-line paragraphs. White space. Include the framework steps as a numbered insight list.
PARTNER LENS: One Director-level insight connecting to Value-Based P&L, Vision 2030, or Digital Transformation.
CTA: End with a provocative open-ended question to drive comments.

Write in first person. Bold key terms. Use line breaks generously.`,
        `Generate a LinkedIn post explaining this approved framework:\n\n${frameworkContext}`
      ),

      // 2. Consulting Opportunity
      aiGenerate(
        LOVABLE_API_KEY,
        `You are a strategy consulting partner. Given an expert framework, propose a consulting/advisory offering. Structure your response with clear sections:

**Problem Statement**: What business challenge this framework addresses
**Service Offering**: The consulting service derived from this framework (name it)  
**Target Clients**: Who would buy this (specific industries, company types, decision-makers)
**Engagement Model**: How the service would be delivered (workshop, retainer, assessment)
**Strategic Value**: Quantifiable impact and ROI story
**Pricing Signal**: Indicative engagement size (e.g., "SR 250K-500K diagnostic")

Write in professional consulting language. Reference Saudi Vision 2030 and digital transformation where relevant.`,
        `Propose a consulting offering based on this approved framework:\n\n${frameworkContext}`
      ),

      // 3. Strategy Brief
      aiGenerate(
        LOVABLE_API_KEY,
        `You are a strategy document writer for a Big 4 consulting firm. Write a one-page strategy brief with these sections:

**EXECUTIVE SUMMARY**: 2-3 sentences on what the framework is and why it matters.
**FRAMEWORK OVERVIEW**: Explain each step clearly with practical guidance.
**WHEN TO USE**: Specific scenarios, triggers, or conditions where this framework applies.
**PROBLEM IT SOLVES**: The business pain point this addresses.
**EXPECTED OUTCOMES**: What results look like after applying this framework.
**IMPLEMENTATION NOTES**: Practical tips for deployment.

Use professional, authoritative language. Format with clear headers and concise paragraphs.`,
        `Write a strategy brief for this approved framework:\n\n${frameworkContext}`
      ),

      // 4. Strategy Slide Content
      aiGenerate(
        LOVABLE_API_KEY,
        `You are a presentation designer. Create structured content for a single strategy consulting slide. Return the content in this exact format:

SLIDE_TITLE: [concise title, max 8 words]
SUBTITLE: [one-line context statement]
KEY_INSIGHT: [one bold statement that captures the framework's value]
STEPS: [rewrite each step as a short bullet - title only, max 6 words each]
BOTTOM_LINE: [one sentence on strategic impact]
VISUAL_NOTE: [describe what diagram type would best represent this - flow, pyramid, matrix, etc.]

Keep everything concise and slide-appropriate. No paragraphs.`,
        `Create strategy slide content for this approved framework:\n\n${frameworkContext}`
      ),
    ]);

    // Store all outputs
    const outputs = [
      {
        framework_id,
        user_id,
        output_type: "linkedin_post",
        title: `LinkedIn Post: ${fw.title}`,
        content: linkedinPost,
        metadata: { pillar_tags: fw.tags, source: "framework_activation" },
      },
      {
        framework_id,
        user_id,
        output_type: "consulting_opportunity",
        title: `Consulting Opportunity: ${fw.title}`,
        content: consultingOpp,
        metadata: { pillar_tags: fw.tags, source: "framework_activation" },
      },
      {
        framework_id,
        user_id,
        output_type: "strategy_brief",
        title: `Strategy Brief: ${fw.title}`,
        content: strategyBrief,
        metadata: { pillar_tags: fw.tags, source: "framework_activation" },
      },
      {
        framework_id,
        user_id,
        output_type: "strategy_slide",
        title: `Strategy Slide: ${fw.title}`,
        content: slideContent,
        metadata: { pillar_tags: fw.tags, source: "framework_activation" },
      },
    ];

    const { data: inserted, error: insertErr } = await adminClient
      .from("framework_activations")
      .insert(outputs)
      .select();

    if (insertErr) throw new Error(`Failed to store activations: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, activations: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("activate-framework error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
