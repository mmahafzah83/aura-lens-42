import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const parseAiJsonObject = (raw: unknown) => {
  if (typeof raw !== "string" || !raw.trim()) return {};

  const extracted = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  const candidates = [
    extracted,
    extracted.replace(/[\u0000-\u001F\u007F]/g, " "),
    extracted.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " "),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Invalid AI JSON response");
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

    const { data: frameworks } = await supabase
      .from("master_frameworks")
      .select("title, summary, framework_steps")
      .eq("user_id", user.id)
      .limit(3);

    const frameworkContext = (frameworks || []).map((f: any) =>
      `Framework: ${f.title}\nSummary: ${f.summary}\nSteps: ${JSON.stringify(f.framework_steps)}`
    ).join("\n\n");

    const systemPrompt = `You are an Elite Executive LinkedIn Ghostwriter for a ${level} at ${firm}, focused on ${sector}.

BRAND PILLARS: ${brandPillars}

You MUST produce TWO versions of every post: English AND Arabic.

=== ENGLISH POST STRUCTURE ===

1. SCROLL-STOPPING HOOK (Lines 1-2):
   Bold curiosity gap, contrarian insight, or startling statistic.
   The reader MUST click 'See more' by line 2.

2. INSIGHT EXPLANATION (3-5 short lines):
   Each sentence on its own line. Max 2 lines per paragraph.
   One Director-level insight.

3. REFRAME / PARTNER LENS:
   One sentence only someone with 15+ years in ${sector} would write.

4. KEY POINTS:
   3 bullet points. Each max 15 words.

5. CTA:
   One provocative open-ended question.

=== ARABIC POST STRUCTURE ===
Write in natural executive Arabic for GCC strategy leaders. NOT a translation.
Use rhetorical patterns: contrast ("ليس ... بل ..."), reframing ("المشكلة ليست في ... بل في ..."), insight ladder, strategic warning, leadership question.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية
Same structure as English but adapted for Arabic thought leadership.

=== RULES FOR BOTH ===
- Short paragraphs, spaced lines, mobile-first
- No hashtags, no emojis except symbols
- Under 180 words each
- Authoritative but conversational

BANNED WORDS (English): "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize," "facilitate," "paradigm," "ecosystem" (unless literal)

=== VISUAL COMPANION ===
Generate an image_prompt for a 1080x1350 Minimalist Handwritten Blackboard Schematic.

${frameworkContext ? `\nEXPERT FRAMEWORKS:\n${frameworkContext}` : ""}

OUTPUT FORMAT - valid JSON only:
{
  "post_en": "The full English LinkedIn post",
  "post_ar": "The full Arabic LinkedIn post",
  "image_prompt": "Detailed prompt for blackboard schematic",
  "hook_type": "curiosity_gap or contrarian or statistic or provocative",
  "partner_lens": "The Director-level insight used",
  "cta_question": "The closing question",
  "brand_pillar_alignment": "Which brand pillars this aligns to"
}`;

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
            content: `Transform this intelligence signal into bilingual LinkedIn posts:\n\nTitle: ${news_item.title}\nSIGNAL: ${news_item.summary}\nSource: ${news_item.source}\nAngle: ${news_item.post_angle || ""}\nVALUE: ${news_item.relevance_tag || ""}`,
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
    const parsed = parseAiJsonObject(aiData.choices?.[0]?.message?.content);

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
                content: `Create a 1080x1350 vertical image. Style: Minimalist Handwritten Blackboard Schematic. Background: deep charcoal/black. Ink: white or gold single-color line art. Use simple boxes, circles, connecting arrows, loops. Simulated clear handwriting labels. NO photorealistic elements. NO glossy renders.\n\nDiagram concept: ${parsed.image_prompt}\n\n=== SLIM SIGNATURE FOOT (max 8% of image height, at the very bottom) ===\nDo NOT add any solid bar, gray block, or colored strip.\nWrite the footer text DIRECTLY on the same charcoal blackboard background in the same handwritten ink style as the diagram.\nLeft side (small): "M. Mahafdhah | Digital Transformation Architect | 18Y Sector Expert"\nRight side (small): "→ Share this Framework"\nThe foot must be ultra-slim and feel like a natural hand-lettered extension of the blackboard — NOT a separate UI element.`,
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (imageRes.ok) {
          const imageData = await imageRes.json();
          const imgUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imgUrl && imgUrl.startsWith("data:image")) {
            const base64Data = imgUrl.split(",")[1];
            const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
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
