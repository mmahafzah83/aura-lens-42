import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONTENT_PROMPTS: Record<string, string> = {
  linkedin_post: `You are a world-class LinkedIn ghostwriter for senior consultants and executives.
Write a compelling LinkedIn post based on the strategic signal below.
Rules:
- Start with a bold hook (first line grabs attention)
- Use short paragraphs (1-3 sentences each)
- Include a thought-provoking question or call-to-action at the end
- Keep it under 1300 characters
- Write in first person, authoritative yet approachable tone
- Do NOT use hashtags
Return ONLY the post text, no titles or metadata.`,

  carousel: `You are a content strategist specialising in LinkedIn carousel posts.
Create a carousel outline (6-8 slides) based on the strategic signal below.
For each slide provide:
- Slide number
- Headline (max 8 words)
- Body text (1-2 sentences)
Return as a numbered list. Slide 1 is the cover, last slide is CTA.`,

  framework: `You are a management consulting thought leader.
Create a named framework based on the strategic signal below.
Include:
- Framework name (catchy, memorable)
- One-sentence summary
- 4-6 steps/pillars with a title and 2-sentence description each
- When to use it
Format with clear headers.`,

  article: `You are a senior thought leadership writer.
Write a 600-800 word article based on the strategic signal below.
Include:
- Compelling headline
- Opening hook paragraph
- 3-4 sections with subheadings
- Practical takeaways
- Strong closing
Write in first person, consultant voice.`,

  whitepaper: `You are a strategy consultant writing an executive briefing.
Write a structured whitepaper outline (1500-2000 words) based on the strategic signal below.
Include:
- Executive summary
- Problem statement
- Analysis (3-4 sections)
- Recommendations
- Conclusion
Use formal, authoritative tone.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Validate JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { signal_id, content_type, language } = await req.json();
    if (!signal_id || !content_type) throw new Error("signal_id and content_type are required");
    if (!CONTENT_PROMPTS[content_type]) throw new Error(`Unsupported content_type: ${content_type}`);

    // Fetch signal
    const { data: signal, error: sigErr } = await sb
      .from("strategic_signals")
      .select("signal_title, explanation, strategic_implications, theme_tags, skill_pillars, what_it_means_for_you")
      .eq("id", signal_id)
      .eq("user_id", user.id)
      .single();

    if (sigErr || !signal) throw new Error("Signal not found");

    const lang = language || "en";
    const langInstruction = lang !== "en" ? `\n\nIMPORTANT: Write the entire output in ${lang === "ar" ? "Arabic" : lang}.` : "";

    const systemPrompt = CONTENT_PROMPTS[content_type] + langInstruction;

    const userPrompt = `STRATEGIC SIGNAL: ${signal.signal_title}

EXPLANATION: ${signal.explanation}

STRATEGIC IMPLICATIONS: ${signal.strategic_implications}

${signal.what_it_means_for_you ? `PERSONAL RELEVANCE: ${signal.what_it_means_for_you}` : ""}

THEMES: ${(signal.theme_tags || []).join(", ")}
SKILL PILLARS: ${(signal.skill_pillars || []).join(", ")}`;

    // Call AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI gateway error:", status, t);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const generatedBody = aiData.choices?.[0]?.message?.content || "";

    if (!generatedBody) throw new Error("AI returned empty content");

    // Derive title
    const title = content_type === "linkedin_post"
      ? signal.signal_title
      : generatedBody.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 120) || signal.signal_title;

    // Store in content_items
    const { data: item, error: insertErr } = await sb
      .from("content_items")
      .insert({
        user_id: user.id,
        signal_id,
        type: content_type,
        title,
        body: generatedBody,
        language: lang,
        generation_params: { model: "google/gemini-3-flash-preview", signal_title: signal.signal_title },
        status: "draft",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Failed to save generated content");
    }

    return new Response(JSON.stringify({ success: true, content_item: item }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
