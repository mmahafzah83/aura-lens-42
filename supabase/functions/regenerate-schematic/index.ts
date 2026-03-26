import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONTENT_STYLES = [
  {
    name: "premium_consulting",
    prompt: "Ultra-clean dark premium background (#1a1a2e). Gold (#d4a843) accent lines. White text. Sharp geometric shapes with subtle gradients. Tier-1 consulting slide quality.",
  },
  {
    name: "editorial_authority",
    prompt: "Rich dark background with editorial typography — serif headers, clean sans-serif body. Subtle divider lines. High-end business magazine infographic feel.",
  },
  {
    name: "structured_infographic",
    prompt: "Dark background with clearly bounded sections. Icon markers for each element. Structured grid layout. Professional LinkedIn-ready visual with clear hierarchy.",
  },
  {
    name: "minimal_executive",
    prompt: "Near-black background with maximum whitespace. Few elements with strong visual weight. Single gold accent. Large bold typography. Executive boardroom quality.",
  },
  {
    name: "strategic_blueprint",
    prompt: "Dark navy background with thin technical grid lines. Blueprint aesthetic with teal accent lines. Monospaced labels. Technical architecture feel.",
  },
  {
    name: "whiteboard_sketch",
    prompt: "Deep charcoal blackboard background. White and gold hand-drawn style lines, boxes, arrows. Simulated handwriting labels. Professor's whiteboard aesthetic.",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_prompt, style_index } = await req.json();
    if (!image_prompt) {
      return new Response(JSON.stringify({ error: "image_prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Select style — use provided index or random
    const idx = typeof style_index === "number"
      ? style_index % CONTENT_STYLES.length
      : Math.floor(Math.random() * CONTENT_STYLES.length);
    const selectedStyle = CONTENT_STYLES[idx];

    const fullPrompt = `Create a 1080x1350 vertical image.

=== VISUAL STYLE ===
${selectedStyle.prompt}

=== CONTENT ===
${image_prompt}

=== BRANDING ===
- Background: Dark premium tone
- Accent: Gold (#d4a843), white text, subtle grays
- Typography: Clean, modern, consulting-grade
- NO photorealistic elements. Pure diagrammatic/infographic style.
- Ensure ALL text is LEGIBLE with proper contrast

=== FOOTER (max 6% height, at very bottom) ===
On the same dark background in small text:
Left: "M. Mahafzah | Business & Digital Transformation Architect | Energy & Utilities"
Right: "→ Share this Framework"
No solid bars or blocks — blend seamlessly.`;

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

    if (!imageRes.ok) {
      if (imageRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (imageRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${imageRes.status}`);
    }

    const imageData = await imageRes.json();
    const imgUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imgUrl || !imgUrl.startsWith("data:image")) {
      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to storage with retry
    const base64Data = imgUrl.split(",")[1];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const filename = `post-visual-${Date.now()}.png`;

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let uploadErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await serviceClient.storage
        .from("capture-images")
        .upload(`${user.id}/${filename}`, binaryData, {
          contentType: "image/png",
          upsert: true,
        });
      uploadErr = result.error;
      if (!uploadErr) break;
      console.warn(`Upload attempt ${attempt + 1} failed:`, uploadErr.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }

    if (uploadErr) {
      console.warn("All upload attempts failed, returning base64 fallback");
      return new Response(JSON.stringify({ image_url: imgUrl, style: selectedStyle.name }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = serviceClient.storage
      .from("capture-images")
      .getPublicUrl(`${user.id}/${filename}`);

    return new Response(JSON.stringify({
      image_url: urlData?.publicUrl || null,
      style: selectedStyle.name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("regenerate-schematic error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
