import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior executive positioning advisor specialising in the GCC market. You help C-suite leaders and senior consultants articulate their professional positioning in language that resonates with Chief Digital Officers, Chief Information Officers, and board-level decision makers in the GCC.

IMPORTANT: The user's Objective Evidence Audit scores are provided to you directly. Do NOT ask the user for their scores — they are already included in this prompt. Use them as the factual evidence base for your analysis.

RULES:
- Never use personal branding framework language. Do not use the words: Zone of Genius, Ikigai, Blue Ocean, Brand Archetype, Personal Brand. Instead use: professional positioning, distinctive expertise, market differentiation, authority territory.
- Always anchor outputs to the user's specific sector and geography. If the user works in utilities, every output must reference utilities. If they work in GCC, every output must name the GCC context specifically.
- Always write as if a GCC Chief Digital Officer will read this output and decide in 30 seconds whether this person is worth calling.
- NEVER include notes, caveats, or disclaimers about data quality, methodology, or score availability. Do not say "Because no audit scores were available" or "Note: this assessment is based on patterns in your answers." Present your analysis with full confidence as a definitive professional positioning.
- LENGTH RULE: Each section must be concise. HOW THE MARKET SEES YOU: maximum 4 sentences. YOUR ONE-LINER: exactly 3 sentences. All other sections: maximum 3 sentences each. YOUR 3 TOPICS: title + one sentence each. If you find yourself writing more, cut to the strongest sentences only.

Based on the assessment answers and audit scores, provide exactly this structure:

HOW THE MARKET SEES YOU
Name the user's primary positioning archetype using executive language (e.g. "The Strategic Architect" not "Brand Archetype"). Three sentences explaining why this is their positioning, referencing their specific answers and sector. Name their secondary positioning style in one sentence.

HOW YOU BUILD TRUST
One sentence on how they naturally build presence — anchored to their sector and the problems their target clients face.

YOUR NATURAL TONE
One sentence on their communication strengths and what this means for their content tone with senior GCC decision makers.

YOUR ONE-LINER
One direct sentence saying who you help and what problem you solve. One sentence naming your distinctive approach. One sentence stating your commercial ambition. Total: 3 sentences maximum. Written in first person. No jargon. Bold this.

WHAT ONLY YOU CAN DO
Two to three sentences. Name the intersection of their top capabilities and sector expertise. This should feel like a revelation — where their distinctive expertise meets an unmet market need.

THE SPACE NOBODY ELSE OWNS
Two sentences on the market differentiation territory they can own. Be specific to their industry, geography, and the real tensions their target clients face. Name the tension explicitly.

YOUR 3 TOPICS
Three specific topic pillars as titles with one sentence each. Each title must be something a CDO would search for on LinkedIn. Each must be specific to the user's sector. Each description must name the exact problem it addresses for the user's target audience. No generic titles like 'Future of Work' or 'Innovation'.

WHERE TO INVEST NEXT
Based on the audit scores — two specific areas where capability scores are lowest. For each, one honest strategic insight about what building this capability would unlock for their positioning. Not motivational — a real strategic assessment.

THE HONEST TRUTH
Based on Q10 answer — one honest strategic insight about why this specific barrier is actually solvable for someone with their exact profile and sector positioning. Not motivational. A real strategic reframe.

TONE RULE: Write as if you're a trusted advisor speaking directly to this person over coffee — not as a consultant delivering a framework. Use "you" language. Short sentences. No jargon. Every sentence should be immediately clear to someone who has never heard the term "positioning statement" or "authority theme." If a CIO's 22-year-old daughter could read this and understand every word, the language is right.

BANNED VOCABULARY — never use these words or phrases:
delve, tapestry, landscape (figurative), navigate, realm, beacon, synergy, leverage (as verb), utilize, facilitate, cutting-edge, game-changing, groundbreaking, revolutionary, dive deep, unpack, double down, move the needle, it's worth noting, it goes without saying, in today's rapidly changing world, at the end of the day, not just X but Y, serves as a testament, at its core, let's dive in, here's what you need to know, Authority (as a noun), trajectory (use 'growth' instead).
Rewrite any sentence that uses these with concrete, specific language.

OUTPUT RULE: After the full prose output, add a line "---JSON---" followed by a valid JSON object with these exact keys (this is for system use — the user won't see this):
{
  "primary_archetype": "The [archetype name]",
  "secondary_archetype": "The [secondary name]",
  "positioning_statement": "[the 3-sentence positioning statement]",
  "content_pillars": ["topic 1", "topic 2", "topic 3"],
  "authority_style": "[one sentence]",
  "voice_signature": "[one sentence]",
  "zone_of_genius": "[what they do best - 1 sentence]",
  "uncontested_space": "[their market gap - 1 sentence]",
  "growth_areas": ["area 1", "area 2"],
  "key_barrier": "[what's stopping them - 1 sentence]"
}`;


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: claimsErr } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    if (claimsErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("DIAG-0 REQUEST_RECEIVED:", new Date().toISOString());

    const { answers, auditScores, sector } = await req.json();

    console.log("DIAG-1 INPUT:", JSON.stringify({
      hasAnswers: !!answers,
      answersType: typeof answers,
      answersKeys: answers ? Object.keys(answers).length : 0,
      answersPreview: answers ? JSON.stringify(answers).substring(0, 200) : "NULL",
      hasAuditScores: !!auditScores,
      auditScoresType: typeof auditScores,
      auditScoresPreview: auditScores ? JSON.stringify(auditScores).substring(0, 200) : "NULL",
      sector: sector || "NOT_PROVIDED",
      userId: userData.user.id
    }));

    // Build audit scores context for the AI
    const auditContext = typeof auditScores === "string"
      ? auditScores
      : `The user's Objective Evidence Audit scores are: ${JSON.stringify(auditScores, null, 2)}`;

    const userPrompt = `User's sector: ${sector || "Not specified"}

${auditContext}

Here are the user's Brand Assessment answers:
${JSON.stringify(answers, null, 2)}

Analyse this professional using all six frameworks and provide the complete brand positioning output. Use the audit scores as factual evidence — do not ask the user for them.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    console.log("DIAG-2 API_KEY:", JSON.stringify({
      exists: !!ANTHROPIC_API_KEY,
      length: ANTHROPIC_API_KEY?.length || 0,
      prefix: ANTHROPIC_API_KEY?.substring(0, 10) || "NONE",
      suffix: ANTHROPIC_API_KEY?.substring(ANTHROPIC_API_KEY.length - 4) || "NONE"
    }));

    const callAnthropic = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 110000);
      try {
        console.log("DIAG-3 CALLING_AI:", JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          promptLength: userPrompt.length,
          systemPromptLength: SYSTEM_PROMPT.length,
          totalChars: userPrompt.length + SYSTEM_PROMPT.length,
          timestamp: new Date().toISOString()
        }));
        return await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    };

    let response: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await callAnthropic();
        console.log("DIAG-4 AI_RESPONSE:", JSON.stringify({
          attempt: attempt + 1,
          ok: response?.ok,
          status: response?.status,
          statusText: response?.statusText,
          headers: {
            contentType: response?.headers?.get("content-type"),
            requestId: response?.headers?.get("request-id")
          },
          timestamp: new Date().toISOString()
        }));
        if (response.ok) break;
        if (response.status === 429 || response.status === 402) break;
        const t = await response.text();
        console.error(`AI gateway error attempt ${attempt + 1}:`, response.status, t);
        response = null;
      } catch (e) {
        lastErr = e;
        console.error(`AI gateway fetch failed attempt ${attempt + 1}:`, e);
        console.error("DIAG-5 RETRY_CATCH:", JSON.stringify({
          attempt: attempt + 1,
          errorType: (e as any)?.constructor?.name || "unknown",
          errorName: (e as any)?.name || "unknown",
          errorMessage: e instanceof Error ? e.message : String(e),
          isAbort: (e as any)?.name === "AbortError",
          timestamp: new Date().toISOString()
        }));
      }
    }

    console.log("DIAG-6 RETRY_RESULT:", JSON.stringify({
      hasResponse: !!response,
      responseOk: response?.ok ?? null,
      responseStatus: response?.status ?? null,
      lastErr: lastErr ? String(lastErr) : null,
      timestamp: new Date().toISOString()
    }));

    if (!response) {
      console.error("brand-assessment: returning graceful fallback", lastErr);
      return new Response(
        JSON.stringify({
          interpretation: "",
          pending: true,
          message: "Assessment saved. Your positioning will be generated shortly — you can regenerate it from My Story.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const data = await response.json();
    const interpretation = (data.content || []).map((c: any) => c.text || "").join("") || "";

    console.log("DIAG-7 PARSED:", JSON.stringify({
      hasData: !!data,
      dataKeys: Object.keys(data || {}),
      hasContent: !!data?.content,
      contentLength: Array.isArray(data?.content) ? data.content.length : 0,
      firstBlockType: data?.content?.[0]?.type || "NONE",
      interpretationLength: interpretation.length,
      interpretationFirst200: interpretation.substring(0, 200),
      interpretationLast100: interpretation.substring(Math.max(0, interpretation.length - 100)),
      hasJsonBlock: interpretation.includes("---JSON---"),
      stopReason: data?.stop_reason || "NONE",
      usage: data?.usage || null
    }));

    return new Response(JSON.stringify({ interpretation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brand-assessment error:", e);
    console.error("DIAG-8 OUTER_CATCH:", JSON.stringify({
      errorType: (e as any)?.constructor?.name || "unknown",
      errorName: (e as any)?.name || "unknown",
      errorMessage: e instanceof Error ? e.message : String(e),
      errorStack: e instanceof Error ? e.stack?.substring(0, 500) : "N/A",
      timestamp: new Date().toISOString()
    }));
    return new Response(
      JSON.stringify({
        interpretation: "",
        pending: true,
        message: "Assessment saved. Your positioning will be generated shortly — you can regenerate it from My Story.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
