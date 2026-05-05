import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SYSTEM_PROMPT = `You are a visual content classifier for LinkedIn posts. Analyze the post text and return a JSON recommendation for the best visual card to accompany this post.

Card types available:
- "insight": A single bold insight or observation. Best for posts that make one strong point.
- "framework": A structured model with 3-5 steps. Best for posts that teach a process or methodology.
- "stat": A post centered around a key number or statistic. Best when there's a striking data point.
- "comparison": A before/after or X vs Y structure. Best for contrasting two approaches.
- "question": A provocative question. Best for posts that challenge conventional thinking.
- "principles": A numbered list of rules or lessons. Best for posts listing key takeaways.
- "cycle": A circular process with connected steps. Best for recurring or feedback loops.
- "equation": A formula showing how elements combine. Best for posts about cause and effect.

Styles available:
- "blackboard": Dark, sophisticated, chalk-on-charcoal. Best for frameworks and data-heavy posts.
- "ember": Bold, warm orange-red. Best for contrarian takes and urgent signals.
- "teal": Cool, contemplative. Best for leadership insights and reflective posts.
- "paper": Light, editorial, warm cream. Best for thoughtful analysis and prestige pieces.
- "navy": Professional dark blue. Best for data-driven posts and corporate strategy.
- "sand": Warm beige, Arabic-optimized. Best for Arabic content.

Return ONLY valid JSON with this exact structure:
{
  "card_type": "insight",
  "style": "blackboard",
  "highlight": "The single most shareable sentence from the post",
  "tag": "A 1-3 word category label for the card header",
  "data_points": [
    { "label": "Step or item name", "value": "Optional value" }
  ]
}

Rules:
- If language is "ar", default style to "sand" unless the content is strongly contrarian (then "ember") or data-heavy (then "blackboard").
- The "highlight" should be the ONE line that would make someone stop scrolling. It becomes the card headline.
- "data_points" should only be filled for framework, stat, comparison, principles, cycle, and equation types.
- For "stat", the first data_point value should be the number (e.g., "73%").
- For "framework" and "principles", each data_point is one step/principle.
- For "comparison", provide exactly 2 data_points (before and after, or X vs Y).
- For "equation", provide 3-4 data_points where the last one is the result.
- The "tag" should be short and professional: "Framework", "Market Signal", "Contrarian", "Lesson", etc. In Arabic: "إطار عمل", "إشارة سوقية", "رأي مخالف", "درس", etc.`;

const VALID_TYPES = ['insight', 'framework', 'stat', 'comparison', 'question', 'principles', 'cycle', 'equation'];
const VALID_STYLES = ['blackboard', 'ember', 'teal', 'paper', 'navy', 'sand'];

function firstSentence(t: string): string {
  const trimmed = (t || '').trim();
  const m = trimmed.match(/^.{10,200}?[.!?؟](?=\s|$)/);
  return m ? m[0] : trimmed.split(/\r?\n/)[0] || trimmed.slice(0, 140);
}

function buildDefaults(post_text: string, language: 'en' | 'ar') {
  return {
    card_type: 'insight',
    style: language === 'ar' ? 'sand' : 'blackboard',
    highlight: firstSentence(post_text),
    tag: language === 'ar' ? 'فكرة' : 'Insight',
    data_points: [] as { label: string; value?: string }[],
  };
}

function extractJson(raw: string): any | null {
  if (!raw) return null;
  // strip code fences
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try to find first {...} */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

function sanitize(rec: any, post_text: string, language: 'en' | 'ar') {
  const defaults = buildDefaults(post_text, language);
  if (!rec || typeof rec !== 'object') return defaults;
  const card_type = VALID_TYPES.includes(rec.card_type) ? rec.card_type : defaults.card_type;
  const style = VALID_STYLES.includes(rec.style) ? rec.style : defaults.style;
  const highlight = typeof rec.highlight === 'string' && rec.highlight.trim() ? rec.highlight.trim() : defaults.highlight;
  const tag = typeof rec.tag === 'string' && rec.tag.trim() ? rec.tag.trim() : defaults.tag;
  const data_points = Array.isArray(rec.data_points)
    ? rec.data_points
        .filter((d: any) => d && typeof d.label === 'string')
        .map((d: any) => ({
          label: String(d.label).slice(0, 200),
          ...(d.value ? { value: String(d.value).slice(0, 100) } : {}),
        }))
        .slice(0, 6)
    : [];
  return { card_type, style, highlight, tag, data_points };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const post_text = typeof body.post_text === 'string' ? body.post_text : '';
    const language: 'en' | 'ar' = body.language === 'ar' ? 'ar' : 'en';

    if (!post_text.trim()) {
      return new Response(JSON.stringify({ success: false, error: 'post_text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: true, recommendation: buildDefaults(post_text, language) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userMsg = `Language: ${language}\n\nPost text:\n${post_text}`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429 || aiRes.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: aiRes.status === 429 ? 'rate_limited' : 'payment_required' }),
          { status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const t = await aiRes.text();
      console.error('[detect-card-style] AI error', aiRes.status, t);
      return new Response(
        JSON.stringify({ success: true, recommendation: buildDefaults(post_text, language) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(raw);
    const recommendation = sanitize(parsed, post_text, language);

    return new Response(
      JSON.stringify({ success: true, recommendation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[detect-card-style] error', e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});