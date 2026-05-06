import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return new Response(JSON.stringify({ error: "Audio file is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Transcribing audio:", audioFile.name, "size:", audioFile.size);

    // Upload audio to storage
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const ext = audioFile.name?.includes("webm") ? "webm" : "mp4";
    const storagePath = `${userId}/voice_${Date.now()}.${ext}`;

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBytes = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await adminClient.storage
      .from("captures")
      .upload(storagePath, audioBytes, {
        contentType: audioFile.type || "audio/webm",
        upsert: false,
      });

    let audioUrl: string | null = null;
    if (uploadError) {
      console.error("Audio upload error:", uploadError.message);
    } else {
      const { data: urlData } = adminClient.storage.from("captures").getPublicUrl(storagePath);
      audioUrl = urlData.publicUrl;
    }

    // Convert audio to base64 for Gemini multimodal (chunked to avoid stack overflow)
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < audioBytes.length; i += CHUNK) {
      const chunk = audioBytes.subarray(i, Math.min(i + CHUNK, audioBytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Audio = btoa(binary);
    const mimeType = audioFile.type || "audio/webm";

    // Use Gemini multimodal to transcribe
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a strict speech-to-text transcriber. Transcribe ONLY the actual spoken words in the audio, exactly as spoken. Rules: (1) Return ONLY the literal transcript text, nothing else. (2) Do NOT analyze, summarize, interpret, translate, or add commentary. (3) Do NOT invent, hallucinate, or add any content that was not actually spoken. (4) If the audio is silent, empty, unintelligible, or contains no clear speech, return the exact string: [NO_SPEECH_DETECTED]. (5) If the audio is in any language (Arabic, English, etc.), transcribe in that original language using its native script. (6) Never produce religious texts, jurisprudence, poetry, or any structured content unless those exact words were clearly spoken in the recording.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: mimeType.includes("webm") ? "webm" : "mp4",
                },
              },
              {
                type: "text",
                text: "Transcribe this audio. If you cannot clearly hear speech, respond with [NO_SPEECH_DETECTED]. Do not invent content.",
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI transcription error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Transcription failed (${aiRes.status})`);
    }

    const aiData = await aiRes.json();
    let transcript = aiData.choices?.[0]?.message?.content?.trim() || "";
    console.log("Transcription complete, length:", transcript.length, "audio bytes:", audioBytes.length);

    // Hallucination guards
    const noSpeech = /\[NO_SPEECH_DETECTED\]/i.test(transcript) || transcript.length === 0;

    // Heuristic: webm/opus voice ≈ 2–4 KB per spoken second. Anything claiming
    // more than ~10 chars per audio-KB is almost certainly hallucinated.
    const audioKb = Math.max(1, audioBytes.length / 1024);
    const charsPerKb = transcript.length / audioKb;
    const looksHallucinated = charsPerKb > 30 && transcript.length > 200;

    if (noSpeech || looksHallucinated) {
      console.warn("Rejecting transcript — noSpeech:", noSpeech, "charsPerKb:", charsPerKb.toFixed(1));
      return new Response(
        JSON.stringify({
          error: "no_speech_detected",
          message: "No clear speech detected in the recording. Please type your note manually.",
          audio_url: audioUrl,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ transcript, audio_url: audioUrl }), {
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
