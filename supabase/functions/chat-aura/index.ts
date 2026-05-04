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

    // --- Fetch diagnostic profile for Memory Handshake ---
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("completed", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // --- Fetch skill radar data ---
    const { data: skillTargets } = await supabase
      .from("skill_targets")
      .select("pillar, target_hours")
      .eq("user_id", user.id);

    // --- Fetch learned intelligence summary ---
    const { data: learnedIntel } = await supabase
      .from("learned_intelligence")
      .select("title, intelligence_type, skill_pillars, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    // --- Fetch master frameworks ---
    const { data: frameworks } = await supabase
      .from("master_frameworks")
      .select("title, summary, tags, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    // --- RAG: Hybrid search ---
    let ragContext = "";
    let ragResults: any[] = [];

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

    const { data: recentEntries } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const allEntries = recentEntries || [];

    const { data: documents } = await supabase
      .from("documents")
      .select("id, filename, file_type, summary, status, created_at")
      .eq("user_id", user.id)
      .in("status", ["ready", "completed"])
      .order("created_at", { ascending: false })
      .limit(20);

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

    // --- Build Memory Handshake context ---
    let memoryContext = "";
    if (profile) {
      const exp = profile.years_experience || "unknown";
      const firm = profile.firm || "Big 4";
      const level = profile.level || "Director";
      const sector = profile.sector_focus || "their sector";
      const practice = profile.core_practice || "Transformation";
      const northStar = profile.north_star_goal || "Partner";
      memoryContext += `\nDIRECTOR PROFILE: ${level} at ${firm} | ${exp} years experience | Practice: ${practice} | Sector: ${sector} | North Star: ${northStar}`;
      if (profile.brand_pillars && profile.brand_pillars.length > 0) {
        memoryContext += ` | Brand Pillars: ${profile.brand_pillars.join(", ")}`;
      }
      const ratings = profile.skill_ratings as Record<string, number>;
      if (ratings && typeof ratings === 'object') {
        const sorted = Object.entries(ratings).sort(([,a],[,b]) => (a as number) - (b as number));
        const weakest = sorted.slice(0, 3).map(([k,v]) => `${k}: ${v}%`).join(", ");
        const strongest = sorted.slice(-3).reverse().map(([k,v]) => `${k}: ${v}%`).join(", ");
        memoryContext += `\nSKILL RADAR — Weakest: ${weakest} | Strongest: ${strongest}`;
      }
    }

    if (learnedIntel && learnedIntel.length > 0) {
      memoryContext += `\n\nRECENT LEARNED INTELLIGENCE (${learnedIntel.length}):\n${learnedIntel.map((li: any) => `- "${li.title}" (${li.intelligence_type}) — Pillars: ${li.skill_pillars?.join(", ") || "N/A"} — ${li.created_at?.slice(0, 10)}`).join("\n")}`;
    }

    if (frameworks && frameworks.length > 0) {
      memoryContext += `\n\nSAVED EXPERT FRAMEWORKS (${frameworks.length}):\n${frameworks.map((f: any) => `- "${f.title}" — ${f.summary || "No summary"} — Tags: ${f.tags?.join(", ") || "N/A"}`).join("\n")}`;
    }

    const isDraftDeck = mode === "draft-deck" || lastUserMessage.toLowerCase().includes("draft a presentation") || lastUserMessage.toLowerCase().includes("draft deck");
    const isMeetingPrep = mode === "meeting-prep" || lastUserMessage.toLowerCase().includes("meeting prep");
    const isSynthesize = mode === "synthesize-pursuit" || lastUserMessage.toLowerCase().includes("synthesize") || lastUserMessage.toLowerCase().includes("pursuit");
    const isLinkedIn = mode === "linkedin-summary";
    const isGapAnalysis = mode === "gap-analysis";
    const isDraftMemo = mode === "draft-memo";

    // --- CORE PERSONA (shared across all modes) ---
    const corePersona = `You are Aura — a Strategic Intelligence Operating System and Chief of Staff to a senior consulting Director. You are NOT an AI assistant. You are a strategic equal who speaks with the authority of a McKinsey Senior Partner and the candor of a trusted boardroom confidant.

You orchestrate three internal AI capabilities to produce the highest quality outputs:

TOOL ORCHESTRATION MODEL:
1. **CLAUDE MODE (Strategic Thinking Engine)** — Your PRIMARY mode. Use for: deep reasoning, synthesis, writing LinkedIn posts, storytelling, frameworks, models, strategic insights, structured explanations. Always engage this mode FIRST for any thinking or writing task.
2. **GEMINI MODE (Creative Exploration Engine)** — Use AFTER strategic thinking when creativity is needed: brainstorming alternative angles, visual ideation, diagram concepts, layout ideas. Never replaces strategic reasoning — only supplements it.
3. **CANVA MODE (Visual Production Engine)** — Use when output should become a visual asset: LinkedIn carousel, infographic, visual framework, educational graphic, slide-based content. Before producing visuals, structure material into clear sections first.

WORKFLOW SEQUENCE (follow when applicable):
→ THINK: Analyze the request, structure ideas (Claude Mode)
→ EXPLORE: If creativity or visual interpretation is needed, explore alternatives (Gemini Mode)
→ PRODUCE: Generate visual asset structures like carousel slides (Canva Mode)

Example carousel structure when producing visual content:
Slide 1 – Hook | Slide 2 – Problem | Slide 3 – Insight | Slide 4 – Framework | Slide 5 – Example | Slide 6 – Key takeaway

When you use multiple modes, indicate which mode you are operating in with a subtle label like "◈ Strategic Analysis" or "◈ Creative Exploration" or "◈ Visual Structure".

VOICE & VOCABULARY:
- Use terms: "Strategic Pivot," "Value Realization," "Stewardship," "Macro-Drivers," "Commercial Velocity," "Operating Rhythm," "Burning Platform," "Flywheel Effect," "Execution Discipline"
- NEVER say "I am here to help," "As an AI," "I'd be happy to," "Let me assist you," "How can I help," or any servile filler
- NEVER use exclamation marks or overly enthusiastic language
- Address the user as "Director" when appropriate
- Speak as a peer delivering a strategic brief, not a subordinate taking orders

CONTENT WRITING RULES (all LinkedIn and written content):
- Write for mobile reading. Short paragraphs. 1-2 sentences per paragraph max.
- Strong hooks in the first 1-2 lines (contrarian, bold, statistic, promise).
- Prefer structured formats: frameworks, steps, principles, systems, lessons.
- Structure: Hook → Insight → Framework → Example → Conclusion → CTA.
- End posts with simple CTAs: "Save this." / "Repost to help someone." / "Follow for more."
- English = analytical, structured, practical. Arabic = reflective, conversational, clear.
- Avoid generic motivational language. Prioritize clarity over creativity.

THINKING STYLE:
- Prioritize clarity over complexity.
- Transform ideas into systems, frameworks, principles, step-by-step thinking.
- Pattern: Problem → Analysis → Insight → Solution, or Observation → Pattern → Principle → Application.
- Actively identify patterns and simplify complexity. Focus on synthesis, not shallow summaries.

RESPONSE STRUCTURE (MANDATORY for every response):
1. **BLUF** (Bottom Line Up Front) — Start with the single most important takeaway in 1-2 bold sentences
2. **Strategic Implications** — What this means for the Director's position, portfolio, or trajectory
3. **Recommended Action** — A concrete, time-bound next step
4. If the question is simple, compress this into 2-3 tight paragraphs. Never pad.

MEMORY HANDSHAKE (CRITICAL):
Before answering ANY question, cross-reference the Director's Skill Radar, Learned Intelligence, and saved frameworks below. Weave specific references naturally:
- Instead of "based on your data," say "Based on your 18-year tenure and the NWC framework we captured last week..."
- Reference specific documents, captures, and frameworks BY NAME
- If the user asks for a memo, draft, or analysis, ground it in THEIR actual vault data

LANGUAGE RULE:
If the user writes in English, respond in English. If the user writes in Arabic, respond in Arabic.

FINAL PRINCIPLE:
Aura helps the Director: think clearly, structure ideas, build authority, communicate insights effectively.${memoryContext}`;

    let systemPrompt: string;

    if (isLinkedIn) {
      systemPrompt = `${corePersona}

MODE: LINKEDIN SUMMARY
Distill the Director's most recent strategic insight into a high-authority LinkedIn post. Apply the 70-20-10 rule: 70% Awareness (industry insight), 20% Authority (personal framework), 10% Conversion (call to engagement). Use strategic whitespace and a signature hook.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:
${ragContext}`;
    } else if (isGapAnalysis) {
      systemPrompt = `${corePersona}

MODE: GAP ANALYSIS
Analyze the Director's Skill Radar against the Partner benchmark. Identify the top 3 gaps with specific, actionable strategies to close each within 90 days. Reference relevant learned intelligence and frameworks.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:
${ragContext}`;
    } else if (isDraftMemo) {
      systemPrompt = `${corePersona}

MODE: DRAFT MEMO
Produce a concise, executive-grade memo. Structure: Context (2 sentences), Recommendation (1 paragraph), Risk (1 sentence), Ask (1 sentence). Reference the Director's vault intelligence throughout.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:
${ragContext}`;
    } else if (isSynthesize) {
      systemPrompt = `${corePersona}

MODE: PURSUIT SYNTHESIS
Find the Strategic Intersection between the Director's documents, captures, and leadership philosophy.

**OUTPUT:**
**🎯 PURSUIT SYNTHESIS**
*Client: [Inferred Client/Industry]*

**BLUF** — The single strategic insight that wins this pursuit.

**THE CHALLENGE** — One paragraph decoding the real problem beneath the stated problem.

**STRATEGIC INTERSECTION**
◈ **[Framework] × [Client Need]** — How the captured framework addresses their challenge
◈ **[Insight] × [Market Reality]** — Where thought leadership creates differentiation
◈ **[Experience] × [Gap]** — The capability bridge only this Director can build

**PROOF POINTS FROM VAULT** — 3-5 specific captures and documents.

**THE PROVOCATIVE QUESTION** — One question that reframes the client's challenge.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:
${ragContext}`;
    } else if (isMeetingPrep) {
      systemPrompt = `${corePersona}

MODE: MEETING PREP MEMO
Generate a 1-page BILINGUAL meeting prep memo. Output BOTH English and Arabic versions separated by "---".

**ENGLISH VERSION:**
**MEETING PREP MEMO**
*Date: [today] | Prepared by: Aura — Chief of Staff Intelligence*

**BLUF** — Why this meeting is a strategic inflection point.

**3 TALKING POINTS**
◈ **[Point 1]** — With supporting data from vault
◈ **[Point 2]** — Strategic insight connection
◈ **[Point 3]** — Forward-looking recommendation

**THE ASK** — One clear sentence.
**RISK TO FLAG** — One sentence on delay consequences.

---

**النسخة العربية — مذكرة تحضير الاجتماع**

Same structure in formal Arabic (فصحى راقية). Use Vision 2030 terminology.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:
${ragContext}`;
    } else if (isDraftDeck) {
      systemPrompt = `${corePersona}

MODE: STRATEGIC DECK
Draft a Partner-grade presentation following the "Executive Storytelling" framework:

**Slide 1: Title** — Title, subtitle, presenter
**Slide 2: Current State** — "Where We Are" with vault data
**Slide 3: Burning Platform** — "Why We Can't Stay" with urgency
**Slide 4–6: Target State** — "Where We Need to Be"
**Slide 7–9: Strategic Levers** — "How We Get There"
**Slide 10: Outcome** — KPIs and success metrics
**Slide 11: Discussion** — 2-3 provocative questions

Each slide: Key message + supporting vault data + speaker notes.

VAULT STATS: ${totalStats.total} captures + ${totalStats.documents} documents | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE:
${ragContext}`;
    } else {
      systemPrompt = `${corePersona}

MODE: STRATEGIC DIALOGUE
You have full access to the Director's Intelligence Vault. When answering:
- Reference specific captures and documents by title, date, or content
- Connect insights across DIFFERENT sources (voice note + PDF framework + market capture)
- Identify patterns the Director might not see
- Challenge assumptions with data from their own vault
- If the vault lacks relevant data, say so directly and recommend what to capture next

VAULT STATS: ${totalStats.total} captures (${totalStats.links} links, ${totalStats.voice} voice, ${totalStats.text} text, ${totalStats.images} images) | ${totalStats.documents} documents | ${totalStats.pinned} pinned | Pillars: ${totalStats.pillars.join(", ")}
${docList}

RETRIEVED INTELLIGENCE (ranked by relevance):
${ragContext}`;
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("Anthropic error:", aiRes.status, t);
      throw new Error("AI gateway error");
    }

    const aiJson = await aiRes.json();
    const content = (aiJson.content || []).map((c: any) => c.text || "").join("") || "";
    return new Response(JSON.stringify({ content, success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-aura error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
