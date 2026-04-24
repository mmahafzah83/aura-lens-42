import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, lang, post_text, sector } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sectorStr = String(sector || "").toLowerCase();
    let prompt: string;
    if (sectorStr.includes("مياه") || sectorStr.includes("utilities") || sectorStr.includes("water")) {
      prompt = "Cinematic aerial photograph of a large water treatment facility or desalination plant in the GCC desert landscape. Golden hour lighting. Industrial pipes and infrastructure. No people. No text. No letters. Dark dramatic sky. Editorial style. Professional.";
    } else if (sectorStr.includes("تحول رقمي") || sectorStr.includes("digital")) {
      prompt = "Cinematic photograph of a modern operations control room with multiple screens showing dashboards. Dark environment, blue and orange accent lighting. No people. No text. No letters. Authoritative, editorial style.";
    } else if (sectorStr.includes("بنية تحتية") || sectorStr.includes("infrastructure")) {
      prompt = "Dramatic aerial photograph of GCC critical infrastructure — power grid, smart city, or industrial complex. Dark cinematic lighting. No people. No text. No letters. Editorial, authoritative.";
    } else {
      prompt = "Cinematic, high-contrast editorial photograph of an executive boardroom or modern office in the Gulf region. Dark atmospheric lighting. Abstract geometric architecture. No people. No text. No letters. Professional, authoritative style.";
    }

    // Use Lovable AI Gateway image generation (chat completions with image modality)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Image gen error:", response.status, t);
      return new Response(JSON.stringify({ error: "generation_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      console.error("No image in response", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "generation_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ image_url: imageUrl, lang }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("flash-image error:", e);
    return new Response(JSON.stringify({ error: "generation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});