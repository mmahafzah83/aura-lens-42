import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function repairAndParseJson(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  const jsonEnd = cleaned.lastIndexOf(jsonStart !== -1 && cleaned[jsonStart] === '[' ? ']' : '}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON found in response");
  }

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned);
  }
}

// ── Archetype definitions ──
const ARCHETYPES = [
  "pyramid_maturity",
  "circular_flywheel",
  "process_flow",
  "system_architecture",
  "org_structure",
  "comparison_before_after",
  "layered_operating_model",
  "strategic_framework_map",
  "decision_tree",
  "mind_map",
  "consulting_matrix",
] as const;

const STYLE_FAMILIES = [
  "premium_consulting",
  "strategic_blueprint",
  "minimal_executive",
  "editorial_authority",
  "structured_infographic",
  "whiteboard_sketch",
  "system_schematic",
  "flowchart_modern",
  "strategic_card",
] as const;

const ARCHETYPE_VISUAL_DESC: Record<string, string> = {
  pyramid_maturity: "A vertical pyramid diagram with the widest tier at bottom narrowing upward. Each tier is a labeled band showing progressive maturity/hierarchy levels. Use distinct shading per tier.",
  circular_flywheel: "A circular cycle diagram with curved arrows connecting each node around the perimeter, showing continuous reinforcing flow. Center label for the core concept.",
  process_flow: "A left-to-right or top-to-bottom sequential flow with distinct step boxes connected by directional arrows. Each step clearly numbered and labeled.",
  system_architecture: "A layered capability stack with horizontal bands grouped by domain. Each band contains capability blocks. Vertical integration lines show cross-cutting concerns.",
  org_structure: "A hierarchical node-tree with a root node at top branching downward. Connecting lines show reporting/relationship structure. Clean spacing between levels.",
  comparison_before_after: "A side-by-side split layout. Left side shows the 'before' state, right side shows the 'after/target' state. Connecting arrows or contrasting icons highlight transformation.",
  layered_operating_model: "Concentric rectangles or horizontal slabs from top (strategy) to bottom (operations). Each layer contains labeled components showing how the operating model is structured.",
  strategic_framework_map: "A structured 2x2 or multi-quadrant grid with labeled axes. Each quadrant contains key concepts. Resembles consulting strategy canvases (BCG, McKinsey style).",
  decision_tree: "A branching tree from a single root question, with yes/no or multi-path branches leading to distinct outcomes. Clean alignment and labeled decision points.",
  mind_map: "A central concept node with radiating branches and sub-branches. Organic but balanced layout. Each branch represents a major theme with supporting details.",
  consulting_matrix: "A professional multi-column framework table or grid. Rows represent dimensions, columns represent phases or categories. Clean borders, header row, structured data presentation.",
};

const STYLE_VISUAL_DESC: Record<string, string> = {
  premium_consulting: "Ultra-clean, dark premium background (#1a1a2e or similar). Gold (#d4a843) accent lines and highlights. White text. Sharp geometric shapes with subtle gradients. Resembles a Tier-1 consulting firm slide.",
  strategic_blueprint: "Dark navy/charcoal background with thin technical grid lines. Blueprint aesthetic with cyan/teal accent lines. Monospaced labels for a technical architecture feel.",
  minimal_executive: "Near-black background with maximum whitespace. Very few elements, each with strong visual weight. Single gold accent color. Large bold typography. Executive boardroom quality.",
  editorial_authority: "Rich dark background with editorial typography — a mix of serif headers and clean sans-serif body. Subtle divider lines. Feels like a high-end business magazine infographic.",
  structured_infographic: "Dark background with clearly bounded sections. Icon-style markers for each element. Structured grid layout. Professional LinkedIn-ready visual with clear information hierarchy.",
  whiteboard_sketch: "Deep charcoal background simulating a blackboard. White and gold hand-drawn style lines, boxes, arrows. Simulated handwriting labels. Professor's whiteboard aesthetic.",
  system_schematic: "Dark technical background. Thin precise lines connecting modules. Rounded-rectangle nodes with subtle borders. Technical system diagram aesthetic with clean labeling.",
  flowchart_modern: "Dark background with modern rounded shapes. Color-coded flow paths. Clean directional arrows with labeled transitions. Modern UX-style flowchart.",
  strategic_card: "Single-card format on dark background. Bordered frame with structured internal sections. Title, key points, and visual elements contained within a card boundary.",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { framework_id, diagram_description, framework_title, mode, exclude_archetype, exclude_style } = await req.json();
    if (!framework_id) throw new Error("framework_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch framework data
    let diagramDesc = diagram_description;
    let title = framework_title || "Framework";
    let summary = "";
    let stepsText = "";

    const { data: fw } = await adminClient
      .from("master_frameworks")
      .select("diagram_description, title, framework_steps, summary")
      .eq("id", framework_id)
      .single();

    if (!fw) throw new Error("Framework not found");
    title = fw.title || title;
    summary = fw.summary || "";
    const steps = (fw.framework_steps as any[]) || [];
    stepsText = steps.map((s: any) => `${s.step_number}. ${s.step_title}: ${s.step_description || ""}`).join("\n");
    diagramDesc = diagramDesc || fw.diagram_description;

    // ── Step 1: Use AI to select the best archetype and style ──
    const archetypeSelectionPrompt = `You are a strategic visual design expert. Analyze this framework and select the BEST diagram archetype and visual style.

Framework: "${title}"
Summary: ${summary}
Steps:
${stepsText}

Available archetypes: ${ARCHETYPES.join(", ")}
Available styles: ${STYLE_FAMILIES.join(", ")}

${exclude_archetype ? `IMPORTANT: Do NOT select "${exclude_archetype}" as the archetype — pick a DIFFERENT one that also fits well.` : ""}
${exclude_style ? `IMPORTANT: Do NOT select "${exclude_style}" as the style — pick a DIFFERENT one.` : ""}

Rules for selection:
- If the framework describes levels, maturity, or progression → prefer pyramid_maturity or layered_operating_model
- If it describes cycles, reinforcing loops, or continuous processes → prefer circular_flywheel
- If it describes sequential steps or workflows → prefer process_flow or flowchart_modern  
- If it describes organizational roles or structures → prefer org_structure
- If it describes systems, capabilities, or ecosystems → prefer system_architecture
- If it describes before/after or transformation → prefer comparison_before_after
- If it describes strategic dimensions or axes → prefer strategic_framework_map or consulting_matrix
- If it describes branching decisions → prefer decision_tree
- If it describes interconnected themes → prefer mind_map

Return JSON: { "archetype": "...", "style": "...", "reasoning": "brief explanation" }`;

    const selectionRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: archetypeSelectionPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!selectionRes.ok) throw new Error(`Archetype selection failed: ${selectionRes.status}`);
    const selectionData = await selectionRes.json();
    const selection = repairAndParseJson(selectionData.choices?.[0]?.message?.content || "{}") as any;

    const selectedArchetype = selection.archetype && ARCHETYPE_VISUAL_DESC[selection.archetype]
      ? selection.archetype
      : ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
    const selectedStyle = selection.style && STYLE_VISUAL_DESC[selection.style]
      ? selection.style
      : STYLE_FAMILIES[Math.floor(Math.random() * STYLE_FAMILIES.length)];

    // ── Step 2: Generate diagram description if missing ──
    if (!diagramDesc || Object.keys(diagramDesc).length === 0) {
      const descRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `Given a framework, create a diagram description matching the "${selectedArchetype}" archetype. Return JSON: { "diagram_type": "${selectedArchetype}", "nodes": [{"id": "n1", "label": "...", "description": "..."}], "connections": [{"from": "n1", "to": "n2", "label": "..."}], "layout_notes": "..." }`,
            },
            {
              role: "user",
              content: `Framework: ${title}\nSummary: ${summary}\nSteps:\n${stepsText}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!descRes.ok) throw new Error("Failed to generate diagram description");
      const descData = await descRes.json();
      diagramDesc = repairAndParseJson(descData.choices?.[0]?.message?.content || "{}");

      await adminClient
        .from("master_frameworks")
        .update({ diagram_description: diagramDesc })
        .eq("id", framework_id);
    }

    // ── Step 3: Build the image prompt ──
    const dd = diagramDesc as any;
    const nodesText = (dd.nodes || []).map((n: any) => `- ${n.label}: ${n.description || ""}`).join("\n");
    const connectionsText = (dd.connections || []).map((c: any) => `${c.from} -> ${c.to}${c.label ? ` (${c.label})` : ""}`).join(", ");

    const archetypeDesc = ARCHETYPE_VISUAL_DESC[selectedArchetype] || "A clean structured diagram";
    const styleDesc = STYLE_VISUAL_DESC[selectedStyle] || STYLE_VISUAL_DESC["premium_consulting"];

    const imagePrompt = `Create a 1080x1350 vertical professional diagram image.

=== VISUAL STYLE ===
${styleDesc}

=== DIAGRAM TYPE ===
${archetypeDesc}

=== CONTENT ===
Title (prominent at top): "${title}"

Nodes/Elements:
${nodesText}

Flow/Connections: ${connectionsText}

Layout guidance: ${dd.layout_notes || "Clean, balanced spacing with clear visual hierarchy"}

=== BRANDING RULES ===
- Background: Dark premium tone (deep charcoal, navy, or near-black)
- Accent colors: Gold (#d4a843) as primary accent, white for text, subtle grays for secondary elements
- Typography: Clean, modern, consulting-grade. Mix of bold headers and refined body text
- Visual tone: Strategic, intelligent, executive-grade quality
- NO photorealistic elements. NO stock photo aesthetics. Pure diagrammatic/infographic style.
- Ensure text is LEGIBLE — proper font sizes, high contrast against background

=== FOOTER SIGNATURE (max 6% of image height, at very bottom) ===
Slim footer on the same dark background:
Left: "M. Mahafzah | Business & Digital Transformation Architect | Energy & Utilities"
Right: "→ Share this Framework"
Footer must blend seamlessly with the diagram background — no solid bars or blocks.`;

    // ── Step 4: Generate the image ──
    const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!imgRes.ok) {
      const errText = await imgRes.text();
      if (imgRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (imgRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Image generation failed: ${imgRes.status} ${errText}`);
    }

    const imgData = await imgRes.json();
    const base64Url = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!base64Url) throw new Error("No image generated");

    // ── Step 5: Upload to storage ──
    const base64Data = base64Url.split(",")[1];
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `diagrams/${framework_id}_${Date.now()}.png`;

    const { error: uploadErr } = await adminClient.storage
      .from("capture-images")
      .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });

    if (uploadErr) throw new Error(`Upload error: ${uploadErr.message}`);

    const { data: publicUrl } = adminClient.storage
      .from("capture-images")
      .getPublicUrl(fileName);

    // Update framework with diagram URL
    await adminClient
      .from("master_frameworks")
      .update({ diagram_url: publicUrl.publicUrl })
      .eq("id", framework_id);

    return new Response(JSON.stringify({
      success: true,
      diagram_url: publicUrl.publicUrl,
      diagram_description: diagramDesc,
      archetype: selectedArchetype,
      style: selectedStyle,
      reasoning: selection.reasoning || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-framework-diagram error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
