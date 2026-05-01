import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STYLE_LABELS: Record<string, { ar: string; en: string }> = {
  comparison: { ar: "مقارنة", en: "Comparison" },
  framework: { ar: "تفكيك", en: "Framework" },
  stat: { ar: "إحصائية", en: "Stat" },
  quote: { ar: "اقتباس", en: "Quote" },
  pattern: { ar: "نمط", en: "Pattern" },
};

function detectStyles(post_text: string, post_type: string): string[] {
  const text = post_text || "";
  const pt = String(post_type || "");

  const has_comparison = /الحقيقة|الخيال|قبل|بعد|مقابل|≠|reality|illusion|before|after|\bvs\b|versus|بالعكس|لكن الواقع/i.test(text);
  const markerMatches = (text.match(/[◆↳]/g) || []).length;
  const numberedAr = /[١٢٣].*[١٢٣].*[١٢٣]/s.test(text);
  const numberedEn = /\b1[\.\)].*\b2[\.\)].*\b3[\.\)]/s.test(text);
  const has_numbered_list = markerMatches >= 3 || numberedAr || numberedEn;
  const has_stat = /\d+\s*%|\d+\s*٪|٧٠|مليون|مليار|billion|million/i.test(text);
  const has_sharp_quote = text.length < 400 || pt.includes("تحدي") || pt.includes("كشف") || /challenge|reveal/i.test(pt);
  const has_pattern = pt.includes("نمط") || /نمط|متكرر|دائماً|كل مرة|pattern|always|every time/i.test(text);

  const picks: string[] = [];
  if (has_comparison) picks.push("comparison");
  if (has_numbered_list) picks.push("framework");
  if (has_stat) picks.push("stat");
  if (has_pattern) picks.push("pattern");
  if (has_sharp_quote && !picks.includes("quote")) picks.push("quote");
  if (!picks.includes("quote")) picks.push("quote");

  // fill to 3
  const fillers = ["quote", "framework", "stat", "comparison", "pattern"];
  for (const f of fillers) {
    if (picks.length >= 3) break;
    if (!picks.includes(f)) picks.push(f);
  }
  return picks.slice(0, 3);
}

function extract(post_text: string) {
  const text = (post_text || "").trim();
  const sentences = text.split(/(?<=[\.!\?؟])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const headline = sentences[0] || text.slice(0, 100);
  const core_insight = sentences.slice(0, 3).join(" ");
  const statMatch = text.match(/(\d{1,3}(?:[\.,]\d+)?\s*[%٪])/);
  const key_stat = statMatch ? statMatch[1].trim() : "";
  return { headline, core_insight, key_stat };
}

function buildPrompt(style: string, vars: { headline: string; core_insight: string; key_stat: string; sector_context: string; brandAccent: string; brandGold: string }) {
  const { headline, core_insight, key_stat, sector_context, brandAccent, brandGold } = vars;
  switch (style) {
    case "comparison":
      return `Create a professional Arabic LinkedIn infographic card in portrait format (4:5 ratio).
Design a split-screen comparison layout:
- LEFT side label: "الواقع" in bold white text on dark gray background
- RIGHT side label: "المأمول" in bold white on deep blue/dark background
- Left side: 4-5 bullet points describing current reality, white text, small icons
- Right side: 4-5 bullet points describing the desired state, blue accent text
- Center divider: vertical accent line (${brandAccent}) with arrow pointing right
- Top title: "${headline}" in large bold Arabic text, centered, white
- Subtitle: "${sector_context}" in smaller gold text (${brandGold})
- Bottom signature bar: dark strip, left side "Mohammad Mahafzah | EY" in white, right side LinkedIn icon + "تابعني على LinkedIn" in small text
- Colors: background #0d0d0d, accents ${brandAccent} and ${brandGold}
- All Arabic text must be legible, RTL, modern sans-serif font
- NO stock photos. Flat design. Professional infographic style.
- The content bullet points should be derived from this post: ${core_insight}`;
    case "framework":
      return `Create a professional Arabic LinkedIn infographic card in portrait format (4:5 ratio).
Design a numbered framework breakdown card:
- Dark background (#0d0d0d or very dark navy)
- Top: Large bold Arabic title "${headline}" in white, centered
- Below title: thin accent horizontal divider line (${brandAccent})
- Main content: 3-5 framework steps or points extracted from the post, each displayed as: [Accent Number Circle ${brandAccent}] [Bold Arabic point title] [smaller description]
- Each point separated by subtle divider line
- Right edge: thin vertical accent bar (${brandAccent}) the full height of content area
- Bottom: key insight or conclusion from the post in italic gold text (${brandGold})
- Bottom signature bar: "Mohammad Mahafzah | EY" left, "تابعني على LinkedIn" right
- Style: clean, structured, editorial. No photos. Modern flat design.
- Content extracted from: ${core_insight}`;
    case "stat":
      return `Create a professional Arabic LinkedIn infographic card in portrait format (4:5 ratio).
Design a bold statement card centered on a key statistic:
- Dark background (#0d0d0d)
- Center dominant element: "${key_stat || "70%"}" in massive bold font (largest element on card), colored accent (${brandAccent})
- Below the number: short Arabic label explaining what the stat means (from post context)
- Above the number: short hook line from post in medium white text
- Below label: 2-3 short insight lines from post_text in smaller white text
- Bottom closing question or insight from post in gold italic text (${brandGold})
- Minimal geometric accent: single horizontal accent line (${brandAccent}) or corner bracket
- Bottom signature bar: "Mohammad Mahafzah | EY" left, "تابعني على LinkedIn" right
- No photos. Typography-first design. Maximum visual impact.
- Content from: ${core_insight}, stat: ${key_stat}`;
    case "quote":
      return `Create a professional Arabic LinkedIn editorial card in portrait format (4:5 ratio).
Design a bold typographic quote card:
- Deep dark background (#0d0d0d or #111111)
- Large Arabic quotation mark « in accent (${brandAccent}), top right corner (RTL leading)
- Main quote: the single most powerful sentence from the post, large bold Arabic white text, centered, occupying 40% of card height
- Thin accent horizontal line (${brandAccent}) below the quote
- Below line: 2-3 supporting lines of context from the post, smaller white text
- Topic tag: "${sector_context}" as a small accent pill badge (${brandAccent}), top left
- Bottom signature: "Mohammad Mahafzah" large, "Senior Manager | EY" smaller gold, LinkedIn icon + "تابعني على LinkedIn"
- Style: premium, editorial, dark luxury. No photos. Typography only.
- Quote extracted from: ${headline}, context from: ${core_insight}`;
    case "pattern":
      return `Create a professional Arabic LinkedIn infographic card in portrait format (4:5 ratio).
Design a repeating pattern / cycle diagram card:
- Dark background (#0d0d0d)
- Title: "${headline}" bold white centered at top
- Main visual: circular or linear flow diagram showing 3-4 stages of the pattern described in the post. Each stage: small icon + Arabic label. Arrows connecting stages colored accent (${brandAccent})
- Below diagram: 2-3 lines explaining why this pattern keeps repeating (from post)
- Bottom insight: the uncomfortable truth or question from the post, in gold text
- Bottom signature bar standard
- Style: clean diagram, minimal, professional. No photos.
- Pattern content from: ${core_insight}`;
    default:
      return `Professional dark-themed Arabic editorial card 4:5 ratio. Quote: "${headline}". Context: ${core_insight}.`;
  }
}

async function generateOne(style: string, prompt: string, apiKey: string) {
  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1536",
        quality: "high",
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error(`OpenAI image error [${style}]:`, resp.status, t.slice(0, 500));
      return { style, label_ar: STYLE_LABELS[style]?.ar || style, label_en: STYLE_LABELS[style]?.en || style, error: "failed" };
    }
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      console.error(`No b64 [${style}]:`, JSON.stringify(data).slice(0, 300));
      return { style, label_ar: STYLE_LABELS[style]?.ar || style, label_en: STYLE_LABELS[style]?.en || style, error: "failed" };
    }
    return {
      style,
      label_ar: STYLE_LABELS[style]?.ar || style,
      label_en: STYLE_LABELS[style]?.en || style,
      image_data: `data:image/png;base64,${b64}`,
    };
  } catch (e) {
    console.error(`Image gen exception [${style}]:`, e);
    return { style, label_ar: STYLE_LABELS[style]?.ar || style, label_en: STYLE_LABELS[style]?.en || style, error: "failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, lang, post_text, sector, post_type, generate_styles } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch active design system tokens for brand colors
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: dsRow } = await admin
      .from('design_system')
      .select('tokens')
      .eq('scope', 'global')
      .eq('is_active', true)
      .single();

    const ds = (dsRow?.tokens as any) || {};
    const BRAND_ACCENT = ds?.colors?.brand?.dark || '#D4B056';
    const BRAND_GOLD = ds?.colors?.brand_glow?.dark || '#E8C77A';

    const styles: string[] = Array.isArray(generate_styles) && generate_styles.length > 0
      ? generate_styles.slice(0, 3)
      : detectStyles(post_text || "", post_type || "");

    const { headline, core_insight, key_stat } = extract(post_text || "");
    const sector_context = String(sector || "").trim();

    const promises = styles.map(style => {
      const prompt = buildPrompt(style, { headline, core_insight, key_stat, sector_context, brandAccent: BRAND_ACCENT, brandGold: BRAND_GOLD });
      return generateOne(style, prompt, OPENAI_API_KEY);
    });

    const visuals = await Promise.all(promises);

    return new Response(JSON.stringify({ success: true, visuals, lang, topic }), {
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
