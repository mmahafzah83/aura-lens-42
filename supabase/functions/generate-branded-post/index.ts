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
    const { news_item } = await req.json();
    if (!news_item) {
      return new Response(JSON.stringify({ error: "news_item required" }), {
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

    // Fetch user profile
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("firm, level, core_practice, sector_focus, brand_pillars, north_star_goal")
      .eq("user_id", user.id)
      .maybeSingle();

    const p = profile as any || {};
    const brandPillars = (p.brand_pillars || []).join(", ") || "Strategy, Innovation, Leadership";
    const firm = p.firm || "Big 4";
    const level = p.level || "Director";
    const sector = p.sector_focus || "Water & Utilities";

    // Fetch expert frameworks
    const { data: frameworks } = await supabase
      .from("master_frameworks")
      .select("title, summary, framework_steps")
      .eq("user_id", user.id)
      .limit(3);

    const frameworkContext = (frameworks || []).map((f: any) =>
      `Framework: ${f.title}\nSummary: ${f.summary}\nSteps: ${JSON.stringify(f.framework_steps)}`
    ).join("\n\n");

    // ─── HOOK-VALUE-IMAGE-CTA SYSTEM PROMPT ───
    const systemPrompt = `You are an Elite Executive LinkedIn Ghostwriter for a ${level} at ${firm}, focused on ${sector}.

BRAND PILLARS: ${brandPillars}

═══ THE 'HANDWRITTEN AUTHORITY' FRAMEWORK ═══

You MUST structure every post with these 4 sections. No exceptions.

1. THE HOOK (Lines 1-3) — Newsletter Headline Logic:
   • Open with a bold curiosity gap, contrarian insight, or startling statistic.
   • Examples: "SR 228M is not a cost center. It's a data mine." or "The biggest threat to Saudi water security isn't scarcity. It's data illiteracy."
   • The reader must NEED to click 'See more' by line 3. Create a cliffhanger.
   • Never start with "I'm excited to share…" or "In today's world…"

2. THE BODY — Atomic Formatting:
   • Maximum whitespace. Every sentence gets its own line.
   • No paragraph longer than 2 lines.
   • Break complex points into 3 bullet points using ◈ or ➔.
   • Include ONE specific 'Director-level' insight that connects the news to Value-Based P&L, Vision 2030, or Digital Transformation in ${sector}.
   • Bold all financial figures and entities (e.g., **SR 228M**, **NWC**, **Vision 2030**).

3. THE PARTNER LENS:
   • Embed one sentence that only someone with 15+ years in ${sector} would write.
   • Reference a specific metric, framework, or operational truth.
   • This is NOT a generic observation — it's a specific, earned insight.

4. THE CTA (Last line):
   • End with ONE provocative, open-ended question that drives comments.
   • Examples: "Are we digitizing for efficiency, or just for the sake of it?" or "When will we treat water data like oil futures?"
   • Never use "What do you think?" or "Agree?"

═══ BANNED WORDS ═══
Never use: "delve," "tapestry," "landscape," "synergy," "leverage" (as verb), "holistic," "robust," "utilize," "facilitate," "paradigm," "ecosystem" (unless literal), "excited to share."

═══ VISUAL COMPANION ═══
Also generate an image_prompt for a 1080x1350 Minimalist Handwritten Blackboard Schematic:
- Background: Deep charcoal or pure black
- Ink: Single-color white or high-contrast gold
- Style: Minimalist line art (boxes, circles, connecting arrows, loops)
- Font: Simulated clear, slightly imperfect handwriting for labels
- Content: An educational diagram that simplifies the CORE concept of the post (e.g., a loop showing 'Smart Meter Data → AI Prediction → Targeted Maintenance')
- FOOTER: Ultra-slim signature at very bottom (max 8% height), written directly on blackboard in same ink — no bars/blocks. Left: "M. Mahafdhah | Digital Transformation Architect | 18Y Sector Expert". Right: "→ Share this Framework".
- NO photorealistic people. NO glossy AI renders. NO stock photo style.

${frameworkContext ? `\nEXPERT FRAMEWORKS TO WEAVE IN:\n${frameworkContext}` : ""}

OUTPUT FORMAT — valid JSON only:
{
  "post": "The full LinkedIn post text with strategic formatting and line breaks",
  "image_prompt": "Detailed prompt for the blackboard schematic diagram",
  "hook_type": "curiosity_gap" | "contrarian" | "statistic" | "provocative",
  "partner_lens": "The specific Director-level insight used",
  "cta_question": "The closing provocative question",
  "brand_pillar_alignment": "Which brand pillar(s) this aligns to"
}`;

    // ─── PASS 1: Generate draft ───
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Transform this intelligence signal into a high-authority LinkedIn post using the Handwritten Authority framework:\n\nTitle: ${news_item.title}\nSIGNAL: ${news_item.summary}\nSource: ${news_item.source}\nAngle: ${news_item.post_angle || ""}\nVALUE: ${news_item.relevance_tag || ""}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

    // ─── PASS 2: Generate blackboard schematic image ───
    let imageBase64: string | null = null;
    if (parsed.image_prompt) {
      try {
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
                content: `Create a 1080x1350 vertical image. Style: Minimalist Handwritten Blackboard Schematic. Background: deep charcoal/black. Ink: white or gold single-color line art. Use simple boxes, circles, connecting arrows, loops. Simulated clear handwriting labels. NO photorealistic elements. NO glossy renders.\n\nDiagram concept: ${parsed.image_prompt}\n\n=== SLIM SIGNATURE FOOT (max 8% of image height, at the very bottom) ===\nDo NOT add any solid bar, gray block, or colored strip.\nWrite the footer text DIRECTLY on the same charcoal blackboard background in the same handwritten ink style as the diagram.\nLeft side (small): "M. Mahafdhah | Business & Digital Transformation Expert"\nRight side (small): "→ Share this Framework"\nThe foot must be ultra-slim and feel like a natural hand-lettered extension of the blackboard — NOT a separate UI element.`,
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (imageRes.ok) {
          const imageData = await imageRes.json();
          const imgUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imgUrl && imgUrl.startsWith("data:image")) {
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

            if (!uploadErr) {
              const { data: urlData } = serviceClient.storage
                .from("capture-images")
                .getPublicUrl(`${user.id}/${filename}`);
              imageBase64 = urlData?.publicUrl || null;
            }
          }
        }
      } catch (imgErr) {
        console.warn("Image generation failed (non-blocking):", imgErr);
      }
    }

    return new Response(JSON.stringify({
      ...parsed,
      image_url: imageBase64,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-branded-post error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
