import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const { entry_id, document_id } = await req.json();
    if (!entry_id && !document_id) {
      return new Response(JSON.stringify({ error: "entry_id or document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch source content
    let sourceContent = "";
    let sourceTitle = "";

    if (entry_id) {
      const { data: entry } = await supabase
        .from("entries")
        .select("content, title, summary, type, skill_pillar")
        .eq("id", entry_id)
        .single();
      if (!entry) throw new Error("Entry not found");
      sourceContent = `Title: ${entry.title || "Untitled"}\nType: ${entry.type}\nPillar: ${entry.skill_pillar || "N/A"}\n\n${entry.content}\n\nSummary: ${entry.summary || ""}`;
      sourceTitle = entry.title || "Untitled Entry";
    }

    if (document_id) {
      const { data: doc } = await supabase
        .from("documents")
        .select("filename, summary, file_type")
        .eq("id", document_id)
        .single();
      const { data: chunks } = await supabase
        .from("document_chunks")
        .select("content")
        .eq("document_id", document_id)
        .order("chunk_index", { ascending: true })
        .limit(20);
      
      sourceContent = `Document: ${doc?.filename || "Unknown"}\nType: ${doc?.file_type}\nSummary: ${doc?.summary || ""}\n\n${(chunks || []).map((c: any) => c.content).join("\n\n")}`;
      sourceTitle = doc?.filename || "Unknown Document";
    }

    // Fetch user's diagnostic profile for skill context
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("generated_skills, skill_ratings")
      .eq("user_id", user.id)
      .maybeSingle();

    const skillContext = profile
      ? `\n\nUser's diagnosed skills: ${JSON.stringify((profile as any).generated_skills?.slice(0, 5)?.map((s: any) => s.name))}\nCurrent ratings: ${JSON.stringify((profile as any).skill_ratings)}`
      : "";

    const systemPrompt = `You are an Intelligence Deconstruction Engine for an elite executive coaching platform.

Your task: Analyze the following content and extract ALL strategic intelligence — frameworks, methodologies, mental models, key principles, and actionable insights.

For each piece of intelligence extracted, classify it:
- intelligence_type: "framework" | "methodology" | "principle" | "insight" | "case_study"
- skill_pillars: Map to relevant skills from this list (choose 1-3):
  "Strategic Client Advisory", "Revenue Growth Leadership", "Executive Presence", "Team Development", "Industry Thought Leadership", "Complex Program Delivery", "Stakeholder Management", "Market Positioning", "Digital Fluency", "Resilience Under Pressure"
- skill_boost_pct: How much this intelligence should boost the relevant skill (1-5, where 3 = standard framework, 5 = transformative insight)
- tags: 2-4 keyword tags

${skillContext}

Output valid JSON:
{
  "extractions": [
    {
      "title": "Name of the framework/insight",
      "content": "Detailed description of the intelligence (2-4 sentences)",
      "intelligence_type": "framework",
      "skill_pillars": ["Strategic Client Advisory"],
      "skill_boost_pct": 3,
      "tags": ["strategy", "advisory"]
    }
  ]
}

Extract 2-6 pieces of intelligence. Focus on ACTIONABLE, STRATEGIC content, not trivia.`;

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
          { role: "user", content: `Deconstruct this content:\n\n${sourceContent.slice(0, 12000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    const extractions = parsed.extractions || [];

    // Insert into learned_intelligence
    const inserted = [];
    for (const ext of extractions) {
      const { data: row, error: insertErr } = await supabase
        .from("learned_intelligence" as any)
        .insert({
          user_id: user.id,
          source_entry_id: entry_id || null,
          source_document_id: document_id || null,
          intelligence_type: ext.intelligence_type || "insight",
          title: ext.title,
          content: ext.content,
          skill_pillars: ext.skill_pillars || [],
          skill_boost_pct: ext.skill_boost_pct || 3,
          tags: ext.tags || [],
        } as any)
        .select()
        .single();
      
      if (!insertErr && row) inserted.push(row);
    }

    return new Response(JSON.stringify({ 
      extracted: inserted.length,
      intelligence: inserted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("deconstruct-upload error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
