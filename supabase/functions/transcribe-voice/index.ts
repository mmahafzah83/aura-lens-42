import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEW_PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return new Response(JSON.stringify({ error: "Audio file is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Transcribing audio:", audioFile.name, "size:", audioFile.size);

    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, audioFile.name || "recording.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append(
      "prompt",
      "Desalination, Digital Twin, NWC, MEWA, KPI, CAPEX, OPEX, SCADA, RO membrane, reverse osmosis, PPP, strategic objectives, utilities, infrastructure, ESG, NOM, TDS, SEC, تحلية, مياه, بنية تحتية, استراتيجية, تحول رقمي"
    );

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("Whisper API error:", whisperRes.status, errText);
      if (whisperRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (whisperRes.status === 401) return new Response(JSON.stringify({ error: "Invalid OpenAI API key." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Whisper transcription failed (${whisperRes.status})`);
    }

    const whisperData = await whisperRes.json();
    const transcript = whisperData.text || "";
    console.log("Transcription complete, length:", transcript.length);

    if (!transcript.trim()) {
      return new Response(JSON.stringify({ transcript: "", summary: null, skill_pillar: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isArabic = hasArabic(transcript);
    const bilingualInstruction = isArabic
      ? `\n\nIMPORTANT: The voice note is in Arabic. Provide each section (Core Idea, Strategic Risk, Next Step) in BOTH Arabic and English. Format each section as:\n[Arabic text]\n[English translation]`
      : "";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_voice_note",
              description: "Analyze a voice note as a Senior Executive Coach would",
              parameters: {
                type: "object",
                properties: {
                  core_idea: { type: "string", description: "One sentence distilling the central thesis. If Arabic, provide bilingual (Arabic then English)." },
                  strategic_risk: { type: "string", description: "One sentence identifying the key risk or blind spot. If Arabic, provide bilingual." },
                  next_step: { type: "string", description: "One concrete, actionable challenge for the executive. Frame as a peer would. If Arabic, provide bilingual." },
                  skill_pillar: {
                    type: "string",
                    enum: NEW_PILLARS,
                    description: "Which skill pillar this thought most relates to",
                  },
                },
                required: ["core_idea", "strategic_risk", "next_step", "skill_pillar"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_voice_note" } },
        messages: [
          {
            role: "system",
            content: `You are a Senior Executive Coach working as a peer to a Director at EY who aspires to be a "Transformation Architect." You are sophisticated, challenging, and neutral. You don't coddle — you clarify. You don't praise easily — you push toward potential.

Given a transcribed voice note, distill it into three components:
1. THE CORE IDEA — the central thesis, stripped of noise
2. THE STRATEGIC RISK — what could go wrong, what's being overlooked, or where the thinking is too narrow
3. THE NEXT STEP — one concrete challenge worthy of a partner meeting agenda. Frame it as: "If I were you, I would..."

Classify under: ${NEW_PILLARS.join(", ")}.${bilingualInstruction}`,
          },
          {
            role: "user",
            content: `Analyze this voice note:\n\n"${transcript}"`,
          },
        ],
      }),
    });

    let summary: string | null = null;
    let skill_pillar: string | null = null;

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          summary = `▸ The Core Idea\n${args.core_idea}\n\n▸ The Strategic Risk\n${args.strategic_risk}\n\n▸ The Next Step\n${args.next_step}`;
          skill_pillar = args.skill_pillar || null;
        } catch { console.error("Failed to parse AI response"); }
      }
    } else {
      console.error("AI analysis failed:", aiRes.status);
    }

    return new Response(JSON.stringify({ transcript, summary, skill_pillar }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-voice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
