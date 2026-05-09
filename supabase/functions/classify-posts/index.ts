import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch posts without topic_label
    const { data: posts, error: fetchErr } = await adminClient
      .from("linkedin_posts")
      .select("id, post_text, hook, content_type, format_type, media_type")
      .eq("user_id", user.id)
      .is("topic_label", null)
      .not("post_text", "is", null)
      .order("published_at", { ascending: false })
      .limit(25);

    if (fetchErr) {
      return new Response(JSON.stringify({ success: false, error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ success: true, classified: 0, message: "All posts already classified" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build classification prompt
    const postSummaries = posts.map((p, i) => {
      const text = (p.post_text || "").slice(0, 500);
      return `[${i}] ${text}`;
    }).join("\n\n");

    const systemPrompt = `You are a LinkedIn content strategist. Classify each post into exactly ONE topic label from this list:
- Leadership & Management
- Industry Trends & Analysis
- Digital Transformation
- Career Development
- Strategy & Innovation
- Client Advisory
- Personal Branding
- Thought Leadership
- Team & Culture
- Technology & Tools
- ESG & Sustainability
- Risk & Compliance
- Market Intelligence
- Professional Growth
- Entrepreneurship

Also assign a theme (2-4 words summarizing the core idea) and a tone (one of: analytical, inspirational, educational, conversational, authoritative, storytelling).

Return ONLY a JSON array with objects: {"index": number, "topic_label": string, "theme": string, "tone": string}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Classify these ${posts.length} LinkedIn posts:\n\n${postSummaries}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_posts",
              description: "Classify LinkedIn posts with topic labels, themes, and tones",
              parameters: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        topic_label: { type: "string" },
                        theme: { type: "string" },
                        tone: { type: "string" },
                      },
                      required: ["index", "topic_label", "theme", "tone"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["classifications"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_posts" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429) {
        return new Response(JSON.stringify({ success: false, error: "Rate limited. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ success: false, error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI error:", status, errText);
      return new Response(JSON.stringify({ success: false, error: "AI classification failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let classifications: any[] = [];

    // Extract from tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        classifications = parsed.classifications || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    // Update posts
    let updated = 0;
    for (const c of classifications) {
      const post = posts[c.index];
      if (!post) continue;

      const { error: updateErr } = await adminClient
        .from("linkedin_posts")
        .update({
          topic_label: c.topic_label,
          theme: c.theme,
          tone: c.tone,
        })
        .eq("id", post.id)
        .eq("user_id", user.id);

      if (!updateErr) updated++;
    }

    return new Response(JSON.stringify({
      success: true,
      total: posts.length,
      classified: updated,
      labels: classifications.map((c: any) => c.topic_label),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[classify-posts] Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
