import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_prompt } = await req.json();
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

    const imageRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: `Create a 1080x1350 vertical image. Style: Minimalist Handwritten Blackboard Schematic. Background: deep charcoal/black. Ink: white or gold single-color line art. Use simple boxes, circles, connecting arrows, loops. Simulated clear handwriting labels. NO photorealistic elements. NO glossy renders.\n\nDiagram concept: ${image_prompt}\n\n=== SLIM SIGNATURE FOOT (max 8% of image height, at the very bottom) ===\nDo NOT add any solid bar, gray block, or colored strip.\nWrite the footer text DIRECTLY on the same charcoal blackboard background in the same handwritten ink style as the diagram.\nLeft side (small): "M. Mahafdhah | Digital Transformation Architect | 18Y Sector Expert"\nRight side (small): "→ Share this Framework"\nThe foot must be ultra-slim and feel like a natural hand-lettered extension of the blackboard — NOT a separate UI element.`,
          },
        ],
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

    // Upload to storage
    const base64Data = imgUrl.split(",")[1];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const filename = `post-visual-${Date.now()}.png`;

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: uploadErr } = await serviceClient.storage
      .from("capture-images")
      .upload(`${user.id}/${filename}`, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = serviceClient.storage
      .from("capture-images")
      .getPublicUrl(`${user.id}/${filename}`);

    return new Response(JSON.stringify({
      image_url: urlData?.publicUrl || null,
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
