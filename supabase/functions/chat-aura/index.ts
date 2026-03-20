import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const { messages, mode } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const lastUserMessage = messages[messages.length - 1]?.content || "";

    // --- RAG: Hybrid search (keyword + semantic) across entries + document chunks ---
    let ragContext = "";
    let ragResults: any[] = [];

    // Generate query embedding for semantic search
    let queryEmbedding: number[] | null = null;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (OPENAI_API_KEY) {
      try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: lastUserMessage.slice(0, 8000),
          }),
        });
        if (embRes.ok) {
          const embData = await embRes.json();
          queryEmbedding = embData.data?.[0]?.embedding || null;
        }
      } catch (e) {
        console.error("Query embedding error:", e);
      }
    }

    try {
      const rpcParams: any = {
        p_user_id: user.id,
        p_query: lastUserMessage,
        p_limit: 15,
      };
      if (queryEmbedding) {
        rpcParams.p_query_embedding = `[${queryEmbedding.join(",")}]`;
      }
      const { data: searchResults } = await adminClient.rpc("search_vault", rpcParams);
      if (searchResults && searchResults.length > 0) {
        ragResults = searchResults;
      }
    } catch (e) {
      console.error("search_vault error:", e);
    }

    // Also fetch recent entries for fallback context
    const { data: recentEntries } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const allEntries = recentEntries || [];

    // Fetch user's documents list
    const { data: documents } = await supabase
      .from("documents")
      .select("id, filename, file_type, summary, status, created_at")
      .eq("user_id", user.id)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(20);

    // Build RAG context from search results
    if (ragResults.length > 0) {
      ragContext = ragResults.map((r: any, i: number) => {
        const parts = [`[${i + 1}] Source: ${r.source} | Type: ${r.type} | Date: ${r.created_at?.slice(0, 10)}`];
        if (r.title) parts.push(`Title: ${r.title}`);
        if (r.pinned) parts.push(`📌 PINNED`);
        if (r.skill_pillar) parts.push(`Pillar: ${r.skill_pillar}`);
        parts.push(`Content: ${r.content}`);
        if (r.summary) parts.push(`Summary: ${r.summary}`);
        return parts.join("\n");
      }).join("\n\n---\n\n");
    }

    // Fallback: if no RAG results, use recent entries
    if (!ragContext) {
      ragContext = allEntries.slice(0, 15).map((e: any, i: number) => {
        const parts = [`[${i + 1}] Type: ${e.type} | Pillar: ${e.skill_pillar || "N/A"} | Date: ${e.created_at?.slice(0, 10)}`];
        if (e.title) parts.push(`Title: ${e.title}`);
        if (e.pinned) parts.push(`📌 PINNED`);
        parts.push(`Content: ${e.content}`);
        if (e.summary) parts.push(`Summary: ${e.summary}`);
        return parts.join("\n");
      }).join("\n\n---\n\n");
    }

    const totalStats = {
      total: allEntries.length,
      documents: documents?.length || 0,
      links: allEntries.filter((e: any) => e.type === "link").length,
      voice: allEntries.filter((e: any) => e.type === "voice").length,
      text: allEntries.filter((e: any) => e.type === "text").length,
      images: allEntries.filter((e: any) => e.type === "image").length,
      pinned: allEntries.filter((e: any) => e.pinned).length,
      pillars: [...new Set(allEntries.map((e: any) => e.skill_pillar).filter(Boolean))],
    };

    const docList = documents && documents.length > 0
      ? `\n\nUPLOADED DOCUMENTS (${documents.length}):\n${documents.map((d: any) => `- ${d.filename} (${d.file_type}) — ${d.summary || "No summary"}`).join("\n")}`
      : "";

    const isDraftDeck = mode === "draft-deck" || lastUserMessage.toLowerCase().includes("draft a presentation") || lastUserMessage.toLowerCase().includes("draft deck");
    const isMeetingPrep = mode === "meeting-prep" || lastUserMessage.toLowerCase().includes("meeting prep");
    const isSynthesize = mode === "synthesize-pursuit" || lastUserMessage.toLowerCase().includes("synthesize") || lastUserMessage.toLowerCase().includes("pursuit");

    let systemPrompt: string;

    if (isSynthesize) {
      systemPrompt = `You are Aura, a Senior Executive Strategist and Pursuit Architect for a Director at EY who brands himself as a "Transformation Architect."

The user wants you to SYNTHESIZE A PURSUIT — find the Strategic Intersection between their uploaded documents, saved captures, and their own leadership thoughts.

**YOUR TASK:**
1. **Client Challenge Analysis** — Decode the core client challenge from the user's prompt
2. **Document Intelligence Scan** — Pull relevant frameworks, methodologies, and data points from their uploaded PDFs and documents
3. **Capture Cross-Reference** — Connect insights from their voice notes, links, and text captures
4. **Strategic Intersection** — Identify where their personal leadership philosophy meets the client's needs, creating a UNIQUE value proposition

**OUTPUT FORMAT:**

**🎯 PURSUIT SYNTHESIS**
*Client: [Inferred Client/Industry]*

**THE CHALLENGE**
One paragraph decoding the real problem beneath the stated problem.

**STRATEGIC INTERSECTION**
◈ **[Your Framework] × [Client Need]** — How your captured framework directly addresses their challenge
◈ **[Your Insight] × [Market Reality]** — Where your thought leadership creates differentiation
◈ **[Your Experience] × [Their Gap]** — The capability bridge only you can build

**THE WINNING NARRATIVE**
A 3-sentence elevator pitch that connects your vault intelligence to the client's transformation journey.

**PROOF POINTS FROM YOUR VAULT**
Reference 3-5 specific captures, documents, or voice notes that support this pursuit.

**THE PROVOCATIVE QUESTION**
One question that reframes the client's challenge and positions you as the thought leader.

Tone: Decisive, visionary, boardroom-ready. Every insight must feel like it was reverse-engineered from a winning proposal.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:

${ragContext}`;
    } else if (isMeetingPrep) {
      systemPrompt = `You are Aura, a Senior Executive Coach preparing a VP-level meeting memo for a Director at EY who brands himself as a "Transformation Architect."

Generate a 1-page BILINGUAL meeting prep memo. Output BOTH English and Arabic versions separated by "---".

**ENGLISH VERSION** — Structure:

**MEETING PREP MEMO**
*Date: [today] | Prepared by: Aura Intelligence*

**CONTEXT** (2-3 sentences)
Why this meeting matters. Reference the most relevant captures and documents.

**3 TALKING POINTS**
◈ **[Point 1 Title]** — One sentence with supporting data from captures
◈ **[Point 2 Title]** — One sentence connecting a strategic insight
◈ **[Point 3 Title]** — One sentence with a forward-looking recommendation

**THE ASK** — One clear sentence: what decision or alignment you need from the VP.

**RISK TO FLAG** — One sentence on what could go wrong if action is delayed.

**CLOSING QUESTION** — A single strategic question to leave the VP thinking.

---

**ARABIC VERSION** — النسخة العربية:

**مذكرة تحضير الاجتماع**
*التاريخ: [اليوم] | إعداد: أورا للذكاء التنفيذي*

Same structure in formal Arabic (فصحى راقية). Use Vision 2030 terminology where relevant.

Tone: Decisive, strategic, zero fluff. Reference actual captures and documents.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:

${ragContext}`;
    } else if (isDraftDeck) {
      systemPrompt = `You are Aura, a Senior Executive Coach and Presentation Strategist for a Director at EY who brands himself as a "Transformation Architect."

The user wants a structured presentation following the "Executive Storytelling" framework with exactly these acts:

**Slide 1: Title Slide** — Title, subtitle, presenter name & role
**Slide 2: Current State** — "Where We Are" with data from captures/documents
**Slide 3: Burning Platform** — "Why We Can't Stay Here" with urgency and evidence
**Slide 4–6: Target State** — "Where We Need to Be" with vision and frameworks
**Slide 7–9: Strategic Levers** — "How We Get There" with concrete initiatives
**Slide 10: Outcome** — "What Success Looks Like" with KPIs
**Slide 11: Discussion** — 2-3 provocative questions

FORMAT each slide as:
**Slide [N]: [Title]** — *[Act Name]*
- Key message
- Supporting data/insight (cite captures and documents)
- Speaker notes

Tone: Visionary, strategic, C-suite ready. Reference actual captures and documents throughout.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:

${ragContext}`;
    } else {
      systemPrompt = `You are Aura, a Senior Executive Coach and Brand Strategist embedded in the user's intelligence system. You are a peer to a Director at EY who aspires to be a "Transformation Architect."

You have access to the user's FULL VAULT — captures (links, voice notes, text, screenshots) AND uploaded documents (PDFs, DOCX, images). You use RAG (Retrieval-Augmented Generation) to find the most relevant intelligence for each query.

When answering:
- Reference specific captures and documents by title, date, or content
- Connect dots across DIFFERENT sources (e.g., a voice note + a PDF framework)
- Identify patterns the user might not see
- Be sophisticated, challenging, and neutral — push toward potential
- If relevant documents exist, cite them specifically

VAULT STATS: ${totalStats.total} captures (${totalStats.links} links, ${totalStats.voice} voice, ${totalStats.text} text, ${totalStats.images} images) | ${totalStats.documents} documents | ${totalStats.pinned} pinned | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE (ranked by relevance):

${ragContext}`;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
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
