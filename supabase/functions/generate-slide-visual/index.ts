import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const { image_prompt, slide_number, style } = await req.json();
    if (!image_prompt) {
      return new Response(JSON.stringify({ error: "image_prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const styleColors: Record<string, string> = {
      consulting: "Deep navy blue (#0F1A3E) background with gold (#D4AF37) accents and white elements.",
      thought_leadership: "Dark black (#0A0A0A) background with coral-red (#FF4D6A) accents and white elements.",
      minimal: "Light warm white (#FAFAF9) background with teal (#0D6E8A) accents and dark elements.",
    };

    const colorInstruction = styleColors[style] || styleColors.consulting;

    const fullPrompt = `Create a 1080x1080 square illustration for a LinkedIn carousel slide.

Style: Modern consulting aesthetic. Abstract and conceptual. Clean composition. Professional.
Color palette: ${colorInstruction}
NO text, NO words, NO letters, NO logos, NO watermarks in the image.
The image should be suitable as a background/visual for a professional slide.

Concept: ${image_prompt}

Make the illustration sophisticated, minimal, and visually striking. Use geometric shapes, abstract forms, and clean lines. The visual should convey the concept through imagery alone.`;

    const retryDelays = [6000, 12000];
    let imgUrl: string | undefined;
    let failureStatus = 500;
    let failureMessage = "No image generated";

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      const imageRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imageRes.ok) {
        const imageData = await imageRes.json();
        imgUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (imgUrl?.startsWith("data:image")) break;

        failureStatus = 500;
        failureMessage = "No image generated";
      } else if (imageRes.status === 429) {
        failureStatus = 429;
        failureMessage = "Rate limit exceeded";
      } else if (imageRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        throw new Error(`AI image error: ${imageRes.status}`);
      }

      if (attempt < retryDelays.length) {
        const retryAfterHeader = imageRes.headers.get("retry-after");
        const retryMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : retryDelays[attempt];
        await sleep(Number.isFinite(retryMs) && retryMs > 0 ? retryMs : retryDelays[attempt]);
      }
    }

    if (!imgUrl || !imgUrl.startsWith("data:image")) {
      return new Response(JSON.stringify({ error: failureMessage, slide_number }), {
        status: failureStatus, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      image_url: imgUrl,
      slide_number: slide_number || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-slide-visual error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
