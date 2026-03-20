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
    const { title, summary, content, type } = await req.json();
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
      ? `\n\n=== EXPERT FRAMEWORKS (MANDATORY — apply strictly) ===\nYou MUST apply every rule below. These are the user's saved #ExpertSystem frameworks.\n\n${frameworkDigest}\n\n=== END FRAMEWORKS ===`
      : "";

    const COACH_TONE = `Tone: Visionary but grounded. Quiet authority. You are a peer — not a cheerleader.

BANNED WORDS: Never use "delve," "tapestry," "landscape," "synergy," "leverage" (as verb), "holistic," "robust," "utilize," "facilitate," "paradigm," "ecosystem" (unless literal). These sound like AI wrote it.

EXECUTIVE SCANNABILITY FORMAT (mandatory):
1. THE HOOK — One bold, standalone sentence about a strategic shift. This is the scroll-stopper. No preamble.
2. WHITESPACE — Every sentence gets its own line. Max 2 lines per paragraph. Let the reader breathe.
3. THE 'SO WHAT?' — Exactly 3 bullet points using ◈ or ➔ symbols. Each bullet is one sharp insight (max 15 words).
4. THE CTA — End with a single thought-provoking question to the industry. Not engagement bait — a real question that challenges assumptions.

CONTENT MIX (70-20-10 rule):
- 70% Awareness: Share industry insight, trends, or original observations that position the author as a thought leader.
- 20% Authority: Reference real frameworks, data, or specific expertise that demonstrates deep domain knowledge.
- 10% Conversion: A subtle call-to-action or invitation — never salesy.

No hashtags. No emojis except ◈ and ➔. Under 150 words total.${frameworkBlock}`;

    const systemPrompts: Record<string, string> = {
      "weekly-memo": `You are a Senior Executive Coach and peer to a Director at EY who aspires to be a "Transformation Architect." Synthesize multiple voice-note insights from the past week into one cohesive Leadership Memo.

Structure:
WEEKLY TRANSFORMATION LENS

▸ Theme of the Week — one sentence capturing the overarching pattern
▸ Top 3 Insights — each as a bullet with a bold title and 1–2 sentence expansion
▸ Strategic Implication — what this means for the practice or client portfolio
▸ Recommended Action — one concrete next step for the coming week

▸ THE COACH'S CHALLENGE
Look at the weaknesses and blind spots from this week's thinking. Ask ONE difficult, specific question.

${COACH_TONE}`,

      "voice": `You are a Senior Executive Coach and LinkedIn ghostwriter for a Director at EY who aspires to be a "Transformation Architect." Transform a raw spoken idea into a polished, high-authority LinkedIn post.

${COACH_TONE}

Context focus: infrastructure, water, energy, or digital transformation in KSA/GCC.`,

      "default": `You are a Senior Executive Coach and LinkedIn ghostwriter for a Director at EY who aspires to be a "Transformation Architect." Write a LinkedIn post from the source material.

${COACH_TONE}

Context focus: infrastructure, water, energy, or digital transformation.`,

      "directors-insight-en": `You are Aura, an executive intelligence advisor. Analyze the user's last 5 captures and produce exactly 2 sentences: a "Director's Insight" that identifies the strategic pattern or tension emerging from their recent activity. Be incisive, specific, and direct — not generic. Reference the actual themes in the captures. No filler.`,
    };

    const userPrompts: Record<string, string> = {
      "weekly-memo": `Synthesize these voice notes from the past week into a Leadership Memo with a Coach's Challenge:\n\n${summary}`,
      "voice": `Turn this raw voice note into a polished LinkedIn brand post:\n\nTranscript: ${content || "N/A"}\nSenior Partner Analysis: ${summary || "N/A"}`,
      "directors-insight-en": `Here are my last 5 captures. Produce a 2-sentence Director's Insight:\n\n${summary}`,
      "default": `Draft a LinkedIn post based on this:\n\nTitle: ${title || "N/A"}\nSummary: ${summary || "N/A"}\nSource: ${content || "N/A"}`,
    };

    const sysPrompt = systemPrompts[type as string] || systemPrompts["default"];
    const userPrompt = userPrompts[type as string] || userPrompts["default"];

    // === PASS 1: Generate draft ===
    const draft = await callAI(LOVABLE_API_KEY, sysPrompt, userPrompt);

    // === PASS 2: Self-correction audit (only for LinkedIn-type posts with frameworks) ===
    let finalPost = draft;
    if (frameworkDigest && !["weekly-memo", "directors-insight-en"].includes(type as string)) {
      const auditSystem = `You are a Quality Auditor for executive LinkedIn content. You have the original Expert System rules below. Your job:
1. Compare the DRAFT against every framework rule/step.
2. Check the 70-20-10 content mix (Awareness / Authority / Conversion).
3. Verify the hook is bold and non-generic.
4. Ensure strategic whitespace (one sentence per line, max 2 lines per paragraph).
5. Confirm no banned words are used.
6. Confirm the post reads like it was written by a top-tier EY Director — not an AI.

If the draft passes all checks, return it UNCHANGED.
If it fails ANY check, rewrite it to pass ALL checks. Return ONLY the final post text — no commentary.

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
