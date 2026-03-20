import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function scoreRelevance(entry: any, query: string): number {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  const fields = [
    entry.content || "",
    entry.summary || "",
    entry.title || "",
    entry.skill_pillar || "",
  ].map(f => f.toLowerCase());

  for (const word of words) {
    for (const field of fields) {
      if (field.includes(word)) score++;
    }
  }
  // Boost entries with summaries (richer context)
  if (entry.summary) score += 1;
  // Boost pinned
  if (entry.pinned) score += 2;
  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, mode } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Get user's entries for context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all user entries
    const { data: entries } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const allEntries = entries || [];
    const lastUserMessage = messages[messages.length - 1]?.content || "";

    // Score and rank entries by relevance to the query
    const scored = allEntries
      .map(e => ({ ...e, _score: scoreRelevance(e, lastUserMessage) }))
      .sort((a, b) => b._score - a._score);

    // Take top 15 most relevant entries for context
    const contextEntries = scored.slice(0, 15);

    const vaultContext = contextEntries
      .map((e, i) => {
        const parts = [`[${i + 1}] Type: ${e.type} | Pillar: ${e.skill_pillar || "N/A"} | Date: ${e.created_at?.slice(0, 10)}`];
        if (e.title) parts.push(`Title: ${e.title}`);
        if (e.pinned) parts.push(`📌 PINNED`);
        parts.push(`Content: ${e.content}`);
        if (e.summary) parts.push(`Summary: ${e.summary}`);
        if (e.image_url) parts.push(`[Has image attachment]`);
        return parts.join("\n");
      })
      .join("\n\n---\n\n");

    const totalStats = {
      total: allEntries.length,
      links: allEntries.filter(e => e.type === "link").length,
      voice: allEntries.filter(e => e.type === "voice").length,
      text: allEntries.filter(e => e.type === "text").length,
      images: allEntries.filter(e => e.type === "image").length,
      pinned: allEntries.filter(e => e.pinned).length,
      pillars: [...new Set(allEntries.map(e => e.skill_pillar).filter(Boolean))],
    };

    const isDraftDeck = mode === "draft-deck" || lastUserMessage.toLowerCase().includes("draft a presentation") || lastUserMessage.toLowerCase().includes("draft deck") || lastUserMessage.toLowerCase().includes("draft a deck");

    let systemPrompt: string;

    if (isDraftDeck) {
      systemPrompt = `You are Aura, a Senior Executive Coach and Presentation Strategist for a Director at EY who brands himself as a "Transformation Architect."

The user wants a structured presentation outline. Search through their vault of captures below and build a slide-by-slide deck outline.

FORMAT each slide as:
**Slide [N]: [Title]**
- Key message
- Supporting data/insight (cite from their captures when possible)
- Speaker notes

Include: Title slide, Agenda, 3-6 content slides, Key Takeaways, and Discussion slide.

Tone: Visionary, strategic, C-suite ready. Reference their actual captures and insights.

USER'S VAULT (${totalStats.total} captures | Pillars: ${totalStats.pillars.join(", ")}):

${vaultContext}`;
    } else {
      systemPrompt = `You are Aura, a Senior Executive Coach and Brand Strategist embedded in the user's intelligence system. You are a peer to a Director at EY who aspires to be a "Transformation Architect."

You have access to the user's vault of captures — links, voice notes, text thoughts, and screenshots. Answer questions ONLY based on their data. If the data doesn't contain relevant information, say so honestly.

When answering:
- Reference specific captures by their title, date, or content
- Connect dots across different captures
- Identify patterns the user might not see
- Be sophisticated, challenging, and neutral — push toward potential

VAULT STATS: ${totalStats.total} captures (${totalStats.links} links, ${totalStats.voice} voice, ${totalStats.text} text, ${totalStats.images} images) | ${totalStats.pinned} pinned | Pillars: ${totalStats.pillars.join(", ")}

USER'S RELEVANT CAPTURES:

${vaultContext}`;
    }

    // Stream response
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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(aiRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-aura error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
