import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchFrameworks(token: string | null): Promise<string> {
  if (!token) return "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return "";

    const { data: frameworks } = await supabase
      .from("master_frameworks")
      .select("title, framework_steps, summary, tags")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!frameworks || frameworks.length === 0) return "";

    const digest = frameworks.map((f: any) => {
      const steps = (f.framework_steps || [])
        .map((s: any) => `  ${s.step_number}. ${s.step_title}: ${s.step_description}`)
        .join("\n");
      return `Framework: ${f.title}\nSummary: ${f.summary}\nSteps:\n${steps}\nTags: ${(f.tags || []).join(", ")}`;
    }).join("\n\n---\n\n");

    return digest;
  } catch (e) {
    console.error("Framework fetch error:", e);
    return "";
  }
}

async function callAI(apiKey: string, system: string, user: string, model = "google/gemini-3-flash-preview"): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) {
    if (res.status === 429) throw { status: 429, message: "Rate limit exceeded. Try again shortly." };
    if (res.status === 402) throw { status: 402, message: "AI credits exhausted." };
    throw new Error("AI gateway error: " + res.status);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, summary, content, type, lang } = await req.json();
    if (!summary && !content) {
      return new Response(JSON.stringify({ error: "Content or summary is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || null;
    const frameworkDigest = await fetchFrameworks(token);

    const frameworkBlock = frameworkDigest
      ? `\n\n=== EXPERT FRAMEWORKS (MANDATORY - apply strictly) ===\nYou MUST apply every rule below. These are the user's saved #ExpertSystem frameworks.\n\n${frameworkDigest}\n\n=== END FRAMEWORKS ===`
      : "";

    const isArabic = lang === "ar";

    const EXPERT_LINKEDIN_EN = `You are an Elite Executive LinkedIn Ghostwriter and Senior Peer Coach for a Director-level strategy leader.

WRITING STRUCTURE (mandatory for ALL posts):

1. SCROLL-STOPPING HOOK (Lines 1-2):
   Bold curiosity gap, contrarian insight, or startling statistic.
   The reader MUST need to click 'See more' by line 2. Create a cliffhanger.
   Never start with "I'm excited to share" or "In today's world"

2. INSIGHT EXPLANATION (3-5 short lines):
   Each sentence on its own line. Max 2 lines per paragraph.
   One specific Director-level insight connecting to the strategic theme.

3. REFRAME / CLARIFICATION:
   One sentence that reframes the problem. Only someone with 15+ years would write this.
   Reference a specific metric, framework, or operational truth.

4. SHORT FRAMEWORK / KEY POINTS:
   3 bullet points using symbols. Each max 15 words.

5. CLOSING INSIGHT + CTA:
   End with one provocative open-ended question that drives comments.
   Not "What do you think?" or "Agree?" - a real strategic question.

FORMATTING RULES:
- Short paragraphs, spaced lines, mobile-first readability
- No hashtags. No emojis except symbols
- Under 180 words total
- Authoritative but conversational tone

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize," "facilitate," "paradigm," "ecosystem" (unless literal), "excited to share"

CONTENT MIX (70-20-10):
- 70% Awareness: Industry insight positioning author as thought leader
- 20% Authority: Real frameworks, data, specific expertise
- 10% Conversion: Subtle invitation, never salesy${frameworkBlock}`;

    const EXPERT_LINKEDIN_AR = `You are an Elite Executive Arabic LinkedIn Ghostwriter for a Director-level strategy leader in the Middle East.

CRITICAL: Write in natural executive Arabic used by strategy leaders and consultants in the GCC. This is NOT a translation - it is original Arabic thought leadership.

ARABIC RHETORICAL STRUCTURES (combine 2-3 per post):

1. Contrast Pattern: "ليس ... بل ..."
2. Reframing: "المشكلة ليست في ... بل في ..."
3. Insight Ladder: Statement then explanation then conclusion
4. Executive Framework: Present ideas using structured numbered points
5. Strategic Warning: Explain what leaders misunderstand about the topic
6. Leadership Question: End with a thought-provoking question
7. Future Signal: Explain an emerging trend and its leadership implication

WRITING STRUCTURE (mandatory):

1. HOOK (1-2 lines): Bold opening using contrast or reframing pattern
2. INSIGHT: 3-5 short lines explaining the strategic point
3. FRAMEWORK/KEY POINTS: 3 structured points
4. CLOSING: Thought-provoking leadership question

PREFERRED TERMINOLOGY:
الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية، رؤية 2030، البنية التحتية

RULES:
- Concise sentences, clear business vocabulary
- Avoid bureaucratic Arabic
- Feel natural, confident, executive - NOT translated
- Short paragraphs, mobile-first readability
- Under 180 words
- No hashtags, no emojis except symbols
- Right-to-left optimized formatting${frameworkBlock}`;

    const systemPrompts: Record<string, string> = {
      "weekly-memo": `You are a Senior Executive Coach. Synthesize voice-note insights into a Leadership Memo.\n\nStructure:\nWEEKLY TRANSFORMATION LENS\n\nTheme of the Week\nTop 3 Insights\nStrategic Implication\nRecommended Action\nCoach's Challenge\n\n${isArabic ? EXPERT_LINKEDIN_AR : EXPERT_LINKEDIN_EN}`,
      "voice": `${isArabic ? EXPERT_LINKEDIN_AR : EXPERT_LINKEDIN_EN}\n\nTransform a raw spoken idea into a polished LinkedIn post.\nContext: infrastructure, water, energy, or digital transformation in KSA/GCC.`,
      "default": `${isArabic ? EXPERT_LINKEDIN_AR : EXPERT_LINKEDIN_EN}\n\nContext: infrastructure, water, energy, or digital transformation.`,
      "directors-insight-en": `You are Aura, an executive intelligence advisor. Analyze the user's last 5 captures and produce exactly 2 sentences: a "Director's Insight" that identifies the strategic pattern or tension emerging from their recent activity. Be incisive, specific, and direct. No filler.`,
    };

    const userPrompts: Record<string, string> = {
      "weekly-memo": `Synthesize these voice notes into a Leadership Memo:\n\n${summary}`,
      "voice": `Turn this raw voice note into a polished LinkedIn post${isArabic ? " in executive Arabic" : ""}:\n\nTranscript: ${content || "N/A"}\nAnalysis: ${summary || "N/A"}`,
      "directors-insight-en": `Here are my last 5 captures. Produce a 2-sentence Director's Insight:\n\n${summary}`,
      "default": `Draft a LinkedIn post${isArabic ? " in executive Arabic" : ""} based on this:\n\nTitle: ${title || "N/A"}\nSummary: ${summary || "N/A"}\nSource: ${content || "N/A"}`,
    };

    const sysPrompt = systemPrompts[type as string] || systemPrompts["default"];
    const userPrompt = userPrompts[type as string] || userPrompts["default"];

    const draft = await callAI(LOVABLE_API_KEY, sysPrompt, userPrompt);

    let finalPost = draft;
    if (frameworkDigest && !["weekly-memo", "directors-insight-en"].includes(type as string)) {
      const auditSystem = `You are a Quality Auditor for executive LinkedIn content.${isArabic ? " The post is in Arabic." : ""} Your job:
1. Compare the DRAFT against every framework rule/step.
2. Check the 70-20-10 content mix.
3. Verify the hook is bold and non-generic.
4. Ensure strategic whitespace (one sentence per line, max 2 lines per paragraph).
5. Confirm no banned words are used.
6. Confirm the post reads like it was written by a top-tier Director - not an AI.
${isArabic ? "7. Confirm Arabic is natural executive Arabic, not translated.\n8. Verify Arabic rhetorical patterns are used." : ""}

If the draft passes all checks, return it UNCHANGED.
If it fails ANY check, rewrite it to pass ALL checks. Return ONLY the final post text - no commentary.

=== EXPERT FRAMEWORKS ===
${frameworkDigest}
=== END FRAMEWORKS ===`;

      const auditPrompt = `Audit and correct this LinkedIn draft:\n\n${draft}`;
      finalPost = await callAI(LOVABLE_API_KEY, auditSystem, auditPrompt);
    }

    return new Response(JSON.stringify({ post: finalPost }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429 || e?.status === 402) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("draft-post error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
