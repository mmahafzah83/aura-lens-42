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

    const EXPERT_LINKEDIN_EN = `You are an Elite Executive LinkedIn Ghostwriter for a Director-level strategy leader.

GENERAL STYLE:
- Write for mobile reading. Short paragraphs. 1-2 sentences per paragraph.
- Break ideas into multiple lines. Never produce large blocks of text.
- Posts should feel like speaking, not academic writing.

HOOK RULE (Lines 1-2):
- The first 1-2 lines must create curiosity using one of: contrarian insight, clear promise, surprising statistic, strong observation.
- Hooks must be short and direct. The reader MUST click "See more."
- Never start with "I'm excited to share" or "In today's world."

STRUCTURE RULE:
- Prefer structured thinking over long explanation.
- Use frameworks like: Steps, Lists, Principles, Systems, Before/After, Problem/Solution, Lessons, Mistakes, Rules.
- Example: "5 lessons from building a startup" or "3 mistakes leaders make."

EXPLANATION PATTERN:
- Every concept follows: Concept → Short explanation → Example.
- Format examples with letter labels: P = Problem, S = Solution, etc.

LINE RHYTHM:
- Alternate between: Short statement → Explanation → Insight.
- Example:
  Most people overcomplicate content.
  But the best posts are simple.
  Clear idea. Clear structure. Clear value.

AUTHORITY SIGNALS:
- Include whenever possible: numbers, experiments, personal experience, real outcomes.
- Examples: "I tested every feature." "This took me two years." "We generated $100M pipeline."

INSIGHT INSERTION:
- Insert mini insights throughout the post.
- Example: "Content is not about volume. It is about clarity."

FORMAT RULES:
- Use lists, bullets, framework breakdowns, short sections.
- Under 180 words total.
- No hashtags. No emojis except symbols.

CTA RULE:
- End with one simple action: Save this / Repost to help someone / Which one do you use most? / Follow for more.

FINAL RULE:
- Every post must feel: Clear, Structured, Practical, Human.
- Avoid sounding like AI. Avoid generic motivational language.
- Prioritize clarity over creativity.

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize," "facilitate," "paradigm," "ecosystem" (unless literal), "excited to share"${frameworkBlock}`;

    const EXPERT_LINKEDIN_AR = `You are an Elite Executive Arabic LinkedIn Ghostwriter for a Director-level strategy leader in the Middle East.

CRITICAL: Write in natural executive Arabic used by strategy leaders and consultants in the GCC. This is NOT a translation - it is original Arabic thought leadership.

GENERAL STYLE:
- Write for mobile reading. Short paragraphs. 1-2 sentences per paragraph.
- Break ideas into multiple lines. Never produce large blocks of text.
- Posts should feel reflective, clear, and conversational.

HOOK RULE (1-2 lines):
- Bold opening using contrast ("ليس ... بل ...") or reframing ("المشكلة ليست في ... بل في ...").
- Must create curiosity immediately.

STRUCTURE RULE:
- Prefer structured thinking: Steps, Lists, Principles, Problem/Solution, Lessons, Rules.
- Use Arabic rhetorical patterns: Contrast, Reframing, Insight Ladder, Strategic Warning, Leadership Question, Future Signal.

EXPLANATION PATTERN:
- Every concept follows: Concept → Short explanation → Example.

LINE RHYTHM:
- Alternate between: Short statement → Explanation → Insight.
- Natural executive Arabic rhythm, not translated English.

AUTHORITY SIGNALS:
- Include numbers, real outcomes, specific experience when possible.

FORMAT RULES:
- Lists, bullets, framework breakdowns, short sections.
- Under 180 words. No hashtags, no emojis except symbols.
- Right-to-left optimized formatting.

PREFERRED TERMINOLOGY:
الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية، رؤية 2030، البنية التحتية

CTA RULE:
- End with one thought-provoking leadership question.

FINAL RULE:
- Every post must feel: Clear, Structured, Practical, Human.
- Avoid sounding like AI. Avoid generic motivational language.
- Prioritize clarity over creativity.
- Feel natural, confident, executive - NOT translated.${frameworkBlock}`;

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

    // Strip any hashtags the model may have added despite instructions
    finalPost = finalPost.replace(/\n*(?:#\w+\s*)+$/g, '').trim();
    finalPost = finalPost.replace(/(?:#[A-Za-z]\w+)/g, '').replace(/\n{3,}/g, '\n\n').trim();

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
