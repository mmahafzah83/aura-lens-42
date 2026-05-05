import { corsHeaders } from "@supabase/supabase-js/cors";

const SYSTEM_PROMPT = `You are a diagram designer for professional LinkedIn visual content. Given a post text, design a data visualization that captures the post's core concept.

You must return ONLY valid JSON matching this schema:

{
  "type": "flow|cycle|matrix|funnel|timeline|layers|radar|bar_chart|bridge|pyramid|gauge|scatter|venn|process|equation|ecosystem",
  "title": "Short diagram title (max 8 words)",
  "subtitle": "Optional one-line context",
  "nodes": [
    { "id": "n1", "label": "Node text", "value": "Optional value", "highlighted": false }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "label": "Optional edge label", "style": "solid|dashed|gold" }
  ],
  "annotations": [
    { "text": "Handwritten note", "position": { "x": 0.5, "y": 0.8 }, "style": "handwritten|label|accent" }
  ]
}

Diagram type selection rules:
- Process with sequential steps → "flow" or "process"
- Recurring loop or feedback → "cycle"
- Compares two dimensions → "matrix"
- Narrowing/filtering → "funnel"
- Chronological events → "timeline"
- Hierarchy or building blocks → "layers" or "pyramid"
- Compares capabilities across dimensions → "radar"
- Compares categories with quantities → "bar_chart"
- Two opposing domains → "bridge"
- Readiness/maturity score → "gauge"
- Correlates two variables → "scatter"
- Overlapping concepts → "venn"
- Formula or cause-and-effect → "equation"
- Connected system → "ecosystem"

Node rules:
- 3-7 nodes for most diagrams. Labels under 4 words.
- Set "highlighted": true for the most important node (the insight).
- For gauge: one node with id "score" and value as the number.
- For equation: last node is the result.
- IDs must be unique strings (n1, n2, n3...).

Annotation rules:
- 1-2 annotations maximum. Provocative or insightful — not just labels.
- Position uses 0-1 coordinates (0,0 = top-left, 1,1 = bottom-right).
- Style "handwritten" = cursive hand-drawn. "accent" = gold emphasis. "label" = neutral.

Edge rules:
- "solid" = established. "dashed" = weak/missing. "gold" = the key path.
- gauge, pyramid, bar_chart typically don't need edges.

Return JSON only. No prose, no code fences.`;

const VALID_TYPES = new Set([
  'flow','cycle','matrix','funnel','timeline','layers','radar','bar_chart',
  'bridge','pyramid','gauge','scatter','venn','process','equation','ecosystem',
]);

const CARD_W = 1080;
const CARD_H = 1350;

function fallbackSpec(postText: string, author: { name: string; title: string }) {
  const words = postText.split(/\s+/).slice(0, 6).join(' ');
  return {
    type: 'flow',
    title: words || 'Strategic Insight',
    subtitle: '',
    nodes: [
      { id: 'n1', label: 'Observe', highlighted: false },
      { id: 'n2', label: 'Decide', highlighted: true },
      { id: 'n3', label: 'Act', highlighted: false },
    ],
    edges: [
      { from: 'n1', to: 'n2', style: 'solid' },
      { from: 'n2', to: 'n3', style: 'gold' },
    ],
    annotations: [],
    author,
  };
}

function sanitize(spec: any, author: { name: string; title: string }, postText: string) {
  if (!spec || typeof spec !== 'object') return fallbackSpec(postText, author);
  if (!VALID_TYPES.has(spec.type)) spec.type = 'flow';
  spec.title = String(spec.title ?? 'Strategic Insight').slice(0, 80);
  if (spec.subtitle) spec.subtitle = String(spec.subtitle).slice(0, 140);

  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    return fallbackSpec(postText, author);
  }
  spec.nodes = spec.nodes.map((n: any, i: number) => ({
    id: String(n.id ?? `n${i + 1}`),
    label: String(n.label ?? '').slice(0, 60),
    value: n.value != null ? String(n.value).slice(0, 40) : undefined,
    highlighted: Boolean(n.highlighted),
    position: n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
      ? { x: n.position.x, y: n.position.y }
      : undefined,
  }));

  if (Array.isArray(spec.edges)) {
    const ids = new Set(spec.nodes.map((n: any) => n.id));
    spec.edges = spec.edges
      .filter((e: any) => ids.has(e.from) && ids.has(e.to))
      .map((e: any) => ({
        from: String(e.from),
        to: String(e.to),
        label: e.label ? String(e.label).slice(0, 40) : undefined,
        style: ['solid','dashed','gold'].includes(e.style) ? e.style : 'solid',
      }));
  } else {
    spec.edges = [];
  }

  if (Array.isArray(spec.annotations)) {
    spec.annotations = spec.annotations.slice(0, 2).map((a: any) => {
      const px = typeof a?.position?.x === 'number' ? a.position.x : 0.5;
      const py = typeof a?.position?.y === 'number' ? a.position.y : 0.85;
      // Convert 0-1 to absolute coords for renderer
      return {
        text: String(a.text ?? '').slice(0, 80),
        position: { x: Math.round(px * CARD_W), y: Math.round(py * CARD_H) },
        style: ['handwritten','label','accent'].includes(a.style) ? a.style : 'handwritten',
      };
    });
  } else {
    spec.annotations = [];
  }

  spec.author = author;
  return spec;
}

function extractJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  // Strip code fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(t); } catch {}
  // Find first { ... last }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch {}
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const postText: string = String(body.post_text ?? '').slice(0, 8000);
    const language: string = body.language === 'ar' ? 'ar' : 'en';
    const author = {
      name: String(body.author_name ?? 'Author'),
      title: String(body.author_title ?? ''),
    };

    if (!postText.trim()) {
      return new Response(JSON.stringify({ success: false, error: 'post_text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = `Language: ${language}\n\nPost text:\n"""\n${postText}\n"""\n\nDesign the optimal diagram. Return ONLY the JSON spec.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted. Add funds to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const errText = await aiResp.text();
      console.error('AI gateway error', aiResp.status, errText);
      const spec = fallbackSpec(postText, author);
      return new Response(JSON.stringify({ success: true, spec, fallback: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResp.json();
    const content: string = aiData?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(content);
    const spec = sanitize(parsed, author, postText);

    return new Response(JSON.stringify({ success: true, spec }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('generate-schematic-spec error', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
