import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, context, style, lang, selected_framework, visual_plan } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isArabic = lang === "ar";

    const styleGuides: Record<string, string> = {
      minimal_creator: "Creator Minimal — Cream/paper background (#FDF6EC), bold black typography, highlighted keywords with dark pill backgrounds, arrows and icons, simple layouts. Clean, airy, premium.",
      dark_creator: "Dark Creator Authority — Pure black background (#0A0A0A), large bold white typography, yellow (#FFD700) accent highlights, cinematic visuals, high contrast.",
      corporate_gradient: "Corporate Gradient — Dark navy-to-charcoal gradient, teal (#2ECDA7) accent bar and highlights, clean corporate typography, professional depth.",
    };

    const styleInstruction = styleGuides[style] || styleGuides.corporate_gradient;

    const langInstruction = isArabic
      ? `Write ALL slide content in natural executive Arabic used by strategy leaders in the GCC.
This is NOT a translation — it is original Arabic thought leadership.
Use rhetorical patterns: contrast, reframing, insight ladder.
Preferred terms: الحوكمة، التحول الرقمي، الاستراتيجية، التنفيذ، القيادة، الهندسة التنظيمية، النظام، السلطة، النمو، الرؤية
Write concise, confident, executive Arabic. RTL optimized.`
      : `Write ALL slide content in English. Use authoritative but conversational tone suitable for senior leaders and consultants.`;

    const frameworkSteps = selected_framework?.steps || [];
    const stepCount = frameworkSteps.length;

    const frameworkContext = selected_framework
      ? `\n\nSELECTED FRAMEWORK TO USE:\nName: ${selected_framework.name}\nDescription: ${selected_framework.description}\nSteps: ${frameworkSteps.join(" → ")}\nDiagram Type: ${selected_framework.diagram_type || "sequential_flow"}\nNumber of stages: ${stepCount}\n\nYou MUST build the carousel around this specific framework.`
      : "";

    const visualPlanContext = visual_plan
      ? `\n\nVISUAL PLAN:\n${JSON.stringify(visual_plan, null, 2)}\n\nFollow this visual plan for layout types, visual decisions, and density levels per slide.`
      : "";

    const systemPrompt = buildSystemPrompt(langInstruction, styleInstruction, isArabic, stepCount);

    const stageList = frameworkSteps.length > 0 
      ? `\n\nMANDATORY STAGE COVERAGE: Every one of these stages MUST appear by name in at least one framework_step slide headline or supporting_text:\n${frameworkSteps.map((s: string, i: number) => `  ${i + 1}. "${s}"`).join("\n")}\n\nIf you skip ANY stage, the output is INVALID. Group adjacent stages into the same slide if needed (e.g., "Stages 1-2: ..."), but every stage name must appear.`
      : "";

    const userPrompt = `Create a LinkedIn carousel about:

Title: ${title}
${description ? `Description: ${description}` : ""}
${context ? `Strategic Context: ${context}` : ""}${frameworkContext}${visualPlanContext}${stageList}

IMPORTANT INSTRUCTIONS:
- First decide the optimal slide count (8-14) based on framework complexity and narrative needs.
- Do NOT force 10 slides — use as many as the framework requires.
- If the framework has ${stepCount} stages, you MUST cover ALL ${stepCount} stages across framework_step slides. No stage may be omitted.
- Each framework_step slide headline MUST reference the exact stage name(s) from the framework.
- Max 30 words per slide, rotate layouts, include emphasis_words, visual_anchor.
- The final slide MUST be an authority CTA with personal branding.
- Do NOT include system labels like "Hook", "Problem", "Insight" on slides — these are internal only.
- You MUST include "generation_checklist" in your JSON output with: explainer_format, stage_coverage map, explainer_slide_count, terminology_consistent, narrative_continuous.`;

    const generateCarousel = async (attempt: number, missingStages?: string[]): Promise<unknown> => {
      let retryAddendum = "";
      if (attempt === 2 && missingStages && missingStages.length > 0) {
        retryAddendum = `

⚠️ CRITICAL RETRY — PREVIOUS GENERATION FAILED VALIDATION ⚠️

The following stages were MISSING from your framework_step slides:
${missingStages.map((s, i) => `  ${i + 1}. "${s}"`).join("\n")}

MANDATORY CORRECTION RULES:
- Each missing stage listed above MUST get its OWN dedicated framework_step slide.
- Do NOT merge these stages with other stages.
- The slide headline MUST contain the EXACT stage name (e.g., "${missingStages[0]}").
- The supporting_text MUST explain that specific stage in detail.
- Add extra slides if needed — do NOT compress to fit a fixed slide count.
- After fixing, verify EVERY stage from the framework appears by name in at least one framework_step slide headline or supporting_text.`;
      } else if (attempt === 3 && missingStages && missingStages.length > 0) {
        retryAddendum = `

🚨 FINAL ATTEMPT — TWO PREVIOUS GENERATIONS FAILED 🚨

You have FAILED TWICE to include all framework stages. This is your LAST chance.

STILL MISSING — these stages were NOT found in ANY framework_step slide:
${missingStages.map((s, i) => `  ${i + 1}. "${s}" — YOU MUST CREATE A DEDICATED SLIDE WITH THIS EXACT TEXT IN THE HEADLINE`).join("\n")}

ABSOLUTE RULES — VIOLATION = TOTAL FAILURE:
1. Create ONE framework_step slide PER missing stage listed above.
2. Copy the stage name VERBATIM into the slide headline. Do not paraphrase, abbreviate, or rename.
3. The supporting_text must contain at least 2 sentences explaining that specific stage.
4. These slides must appear BEFORE the stat/CTA slides.
5. Do NOT remove or modify any existing slides that already cover other stages.
6. The total slide count WILL increase — this is expected and required.
7. Double-check: after generating, mentally scan every framework_step slide and confirm each stage name appears word-for-word.`;
      }

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 16384,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt + retryAddendum },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw Object.assign(new Error("Rate limit exceeded"), { status: 429 });
        if (res.status === 402) throw Object.assign(new Error("AI credits exhausted"), { status: 402 });
        throw new Error(`AI error: ${res.status}`);
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "{}";

      let parsed: any;
      try {
        parsed = extractAndParseJson(raw);
      } catch (parseErr) {
        console.error("Raw LLM response (first 500 chars):", raw.substring(0, 500));
        console.error("Raw LLM response (last 300 chars):", raw.substring(raw.length - 300));
        throw new Error("Failed to parse carousel response");
      }

      return parsed;
    };

    // Generate with validation + auto-retry
    const MAX_ATTEMPTS = 2;
    let parsed: any;
    let validationResult: { coverage: number; missing: string[] } | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      parsed = await generateCarousel(attempt, validationResult?.missing);
      
      // Validate framework stage coverage
      if (frameworkSteps.length > 0 && parsed?.slides) {
        validationResult = validateStageCoverage(parsed.slides, frameworkSteps);
        console.log(`Attempt ${attempt} — Stage coverage: ${(validationResult.coverage * 100).toFixed(0)}%, missing: [${validationResult.missing.join(", ")}]`);

        if (validationResult.coverage >= 0.8) {
          break;
        }

        if (attempt < MAX_ATTEMPTS) {
          console.log(`Coverage below 80%, auto-regenerating (attempt ${attempt + 1}) with ${validationResult.missing.length} missing stages...`);
        }
      } else {
        break;
      }
    }

    // Attach validation metadata
    if (validationResult) {
      parsed.validation = {
        stage_coverage_pct: Math.round(validationResult.coverage * 100),
        missing_stages: validationResult.missing,
        passed: validationResult.coverage >= 0.8,
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429 || e?.status === 402) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-carousel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractKeyTerms(stage: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "of", "for", "in", "on", "to", "with",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "shall", "can", "need", "must", "at", "by", "from", "into", "through",
    "during", "before", "after", "above", "below", "between", "under", "over",
    "level", "stage", "phase", "step", "tier",
  ]);
  // Remove parenthetical content, split, filter stop words and short words
  const cleaned = stage.replace(/\(.*?\)/g, " ").replace(/[^a-zA-Z0-9\s-]/g, " ");
  const words = cleaned.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  return [...new Set(words)];
}

function validateStageCoverage(slides: any[], frameworkSteps: string[]): { coverage: number; missing: string[] } {
  // Collect all text from framework_step, framework_intro, and architecture slides
  const allText = slides
    .filter((s: any) => ["framework_step", "framework_intro", "architecture"].includes(s.slide_type))
    .map((s: any) => `${s.headline || ""} ${s.supporting_text || ""}`.toLowerCase())
    .join(" ");

  const missing: string[] = [];
  for (const stage of frameworkSteps) {
    const stageLower = stage.toLowerCase();

    // 1. Exact substring match
    if (allText.includes(stageLower)) continue;

    // 2. First 2-word prefix match
    const words = stageLower.split(/\s+/);
    const shortMatch = words.slice(0, Math.min(2, words.length)).join(" ");
    if (allText.includes(shortMatch)) continue;

    // 3. Fuzzy keyword match — extract key terms and check if majority appear
    const keyTerms = extractKeyTerms(stage);
    if (keyTerms.length > 0) {
      const matched = keyTerms.filter(term => allText.includes(term));
      // Consider covered if ≥60% of key terms found (at least 2, or all if fewer)
      const threshold = Math.max(2, Math.ceil(keyTerms.length * 0.6));
      if (matched.length >= Math.min(threshold, keyTerms.length)) continue;
    }

    // 4. Also check parenthetical content separately (e.g. "Monitoring & Visualization")
    const parenMatch = stage.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const parenTerms = parenMatch[1].toLowerCase().split(/[\s,&]+/).filter(w => w.length > 2);
      const parenMatched = parenTerms.filter(t => allText.includes(t));
      if (parenMatched.length >= Math.ceil(parenTerms.length * 0.5)) continue;
    }

    missing.push(stage);
  }

  const covered = frameworkSteps.length - missing.length;
  const coverage = frameworkSteps.length > 0 ? covered / frameworkSteps.length : 1;
  return { coverage, missing };
}

function extractAndParseJson(raw: string): unknown {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();

  const jsonStart = cleaned.search(/[{[]/);
  if (jsonStart === -1) throw new Error("No JSON found");

  cleaned = cleaned.substring(jsonStart);

  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

  cleaned = cleaned.replace(/,?\s*"[^"]*$/, "");
  cleaned = cleaned.replace(/,\s*$/, "");

  let braces = 0, brackets = 0;
  for (const char of cleaned) {
    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }

  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }

  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

  return JSON.parse(cleaned);
}

function buildSystemPrompt(langInstruction: string, styleInstruction: string, isArabic: boolean, frameworkStepCount: number): string {
  const frameworkDepthRule = frameworkStepCount > 3
    ? `The selected framework has ${frameworkStepCount} stages. You MUST either:
(a) Compress into 3 strategic maturity bands (e.g., Foundation / Progression / Leadership), OR
(b) Allocate at least 3 dedicated slides to explain the stages in grouped sequences.
Do NOT use just 1 overview slide + 1 partial explainer for a ${frameworkStepCount}-stage model.`
    : `The framework has ${frameworkStepCount || "few"} stages. Explain each stage clearly across dedicated slides.`;

  return `You are Aura — an AI-powered strategic content engine that produces consulting-quality LinkedIn carousels focused on infrastructure, utilities, AI, digital transformation, and sustainability.

Content must always remain ethical, professional, and industry-focused.

═══════════════════════════════════
DYNAMIC SLIDE COUNT
═══════════════════════════════════

Do NOT default to exactly 10 slides. Instead:
1. Analyze the narrative structure needed.
2. Assess framework complexity — how many stages need explanation.
3. Determine the optimal slide count (8–14 slides).
4. Only then generate that many slides.

The goal is narrative completeness, not a fixed number.

═══════════════════════════════════
FRAMEWORK DEPTH RULE
═══════════════════════════════════

${frameworkDepthRule}

═══════════════════════════════════
FRAMEWORK EXPLANATION RULE
═══════════════════════════════════

After the framework overview slide, you MUST continue with a structured explainer sequence. Choose ONE of these valid formats:

Option A — Maturity Bands:
- Framework overview
- Where most firms are stuck (early stages)
- What progression looks like (middle stages)
- What leadership must do (advanced stage + implication)

Option B — Sequential Deep-Dive:
- Overview
- Early stages (grouped)
- Middle stages (grouped)
- Advanced stage + strategic implication

Option C — Transformation Arc:
- Current state
- Transition state
- Target state
- Strategic action required

CRITICAL: The explainer slides must feel like a CONTINUATION of the framework — same terminology, same stage labels, same visual language. Do NOT introduce new frameworks, new labels, or new architectures that feel disconnected.

═══════════════════════════════════
FRAMEWORK CONTINUITY RULE
═══════════════════════════════════

Every slide after the framework introduction must reference the same model. If the framework is "Digital Water Maturity Model" with stages A → B → C → D → E, the explainer slides must use those exact stage names.

Do NOT switch to a second framework unless explicitly presented as a sub-model within the main framework.

═══════════════════════════════════
STRATEGIC CLARITY RULE
═══════════════════════════════════

Prioritize executive understanding over completeness. When in doubt:
- Simplify 5-step models into 3 strategic bands for LinkedIn
- Use contrast: "Where most are" vs "Where leaders are" vs "What good looks like"
- Each explainer slide should have a clear executive takeaway

═══════════════════════════════════
MANDATORY PRE-GENERATION CHECKLIST
═══════════════════════════════════

Before generating ANY slides, you MUST complete this checklist internally. Include the checklist result in your JSON output as "generation_checklist".

CHECKLIST ITEM 1 — EXPLAINER FORMAT CHOSEN
State which format you chose: "Option A — Maturity Bands", "Option B — Sequential Deep-Dive", or "Option C — Transformation Arc".
You MUST pick exactly one. Do NOT mix formats.

CHECKLIST ITEM 2 — STAGE COVERAGE MAP
List EVERY stage from the selected framework and map each one to a specific slide number.
Example: { "Reactive & Manual": "slide_6", "Monitored & Digitized": "slide_6", "Connected & Analyzed": "slide_7", "Predictive & Optimized": "slide_8", "Autonomous & Resilient": "slide_8" }
EVERY stage must appear. No stage may be omitted.

CHECKLIST ITEM 3 — EXPLAINER SLIDE COUNT
Count the number of framework_step slides. This number MUST be >= 3 when the framework has more than 3 stages.

CHECKLIST ITEM 4 — TERMINOLOGY CONSISTENCY
Confirm that every explainer slide uses the EXACT stage names from the framework. No renaming, no paraphrasing.

CHECKLIST ITEM 5 — NARRATIVE CONTINUITY
Confirm that no new framework, model, or architecture is introduced in the explainer slides that was not part of the selected framework.

═══════════════════════════════════
PRE-GENERATION THINKING PROCESS
═══════════════════════════════════

Before generating slides, follow these steps internally:

STEP 1 — TOPIC ANALYSIS
Identify: core industry challenge, strategic insight, transformation opportunity.

STEP 2 — FRAMEWORK ASSESSMENT
Assess the selected framework's complexity. Decide if stages need compression or expansion.

STEP 3 — COMPLETE THE MANDATORY CHECKLIST ABOVE
Fill in all 5 checklist items. If any item fails, revise your plan before proceeding.

STEP 4 — NARRATIVE ARCHITECTURE
Plan the full slide sequence: hook → problem → data → reframe → framework intro → framework explainers → future insight → CTA.

STEP 5 — SLIDE COUNT DECISION
Set the total slide count based on narrative needs (8–14).

STEP 6 — VISUAL PLANNING
For each slide, decide layout type and image strategy (PHOTO: vs INFOGRAPHIC:).

STEP 7 — GENERATE
Generate all slides following the structure and checklist.

═══════════════════════════════════
EY ALIGNMENT
═══════════════════════════════════

Align with the professional tone and perspective of EY.
Safe framing examples:
- "In our work at EY supporting digital transformation initiatives..."
- "Across infrastructure modernization programs..."
- "Industry transformation efforts show that..."
Never reference competitor consulting firms.
Never imply confidential client work.
Insights must be presented as industry observations and strategic perspectives.
Tone: analytical, calm, professional.

═══════════════════════════════════
MOBILE-FIRST DESIGN
═══════════════════════════════════

Canvas: 1080 × 1350 (LinkedIn portrait)
Safe margins: 120px all sides
Headline: 6-10 words maximum.
Explanation text: 12-18 words.
Maximum 30 words per slide (headline + supporting text combined)
Each slide communicates ONE idea.
Strong spacing between headline and body text.
Readable within 2 seconds.
Avoid dense paragraphs.

═══════════════════════════════════
NO SYSTEM LABELS
═══════════════════════════════════

CRITICAL: Do NOT display internal labels on slides. The following labels are for internal structure only and must NEVER appear in the headline or supporting_text:
- Hook, Problem, Insight, Pattern Interrupt, Framework Intro, Framework Step, Future Insight, CTA, Save

The slide content must read naturally as standalone insight text without any structural labels.

═══════════════════════════════════
AUTHOR NAME
═══════════════════════════════════

Always display the author name "M. Mahafzah" clearly on slides.
The name must be readable on mobile — do not reduce font too much.
Place subtly but clearly.

═══════════════════════════════════
LAYOUT ROTATION SYSTEM
═══════════════════════════════════

Do NOT repeat identical layouts. ROTATE layouts across slides for visual rhythm.

Available layouts:
- "hero_center" — Title centered with short insight below.
- "left_impact" — Text left-aligned, visual/accent on right side.
- "right_impact" — Text right-aligned, visual/accent on left side.
- "split_vertical" — Two columns comparing ideas side by side.
- "numbered_point" — Large number badge + insight text.
- "quote_block" — Quote-style with large quote mark.
- "stat_callout" — Large number/stat dominates the slide.
- "infographic" — Visual framework diagram with minimal text.
- "closing_centered" — Final CTA slide with personal branding.

CRITICAL: Each slide MUST use a DIFFERENT layout. Rotate through them. Never use the same layout more than twice in the entire carousel.

═══════════════════════════════════
CAROUSEL STRUCTURE (flexible)
═══════════════════════════════════

Opening slides (2-4 slides):
- Hook slide (hero_center): Bold curiosity-driven headline. Max 6 words.
- Problem framing (left_impact): Expose a common misunderstanding.
- Data point (stat_callout): A compelling statistic.
- Reframing insight (right_impact): The deeper "aha" moment.

Framework section (3-6 slides):
- Framework introduction (infographic): Introduce visually with diagram_data.
- Framework explainers: Use the explainer format chosen above.
  Each explainer slide uses clear stage labels from the framework.
- Architecture diagram (infographic): System architecture with diagram_data.

Closing slides (2-3 slides):
- Forward-looking insight (quote_block): A big idea about the future.
- Authority CTA (closing_centered): The supporting_text MUST include:
  "M. Mahafzah\\nStrategy | Digital & Business Transformation\\nFocus on Utilities & Power\\n\\nhttps://www.linkedin.com/in/mmahafzah/\\n\\n↻ Repost if this was helpful."

═══════════════════════════════════
EMPHASIS & VISUAL ANCHORS
═══════════════════════════════════

- Mark 1-3 KEY WORDS per slide in "emphasis_words"
- visual_anchor options: "arrow_down" | "highlight_box" | "underline_bar" | "icon_grid" | "number_badge" | "quote_mark" | "divider_accent" | "large_number" | null

═══════════════════════════════════
INFOGRAPHIC / DIAGRAM DATA
═══════════════════════════════════

For framework/architecture slides, include diagram_data:
{ type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Use consulting-style visuals: system frameworks, pipelines, infrastructure networks, process flows, architecture diagrams.

═══════════════════════════════════
IMAGE STRATEGY
═══════════════════════════════════

Each slide's image_prompt must specify the visual type:
- Prefix "PHOTO:" for real-world industry imagery (utilities, control rooms, pipelines, treatment plants, sensor fields, water infrastructure)
- Prefix "INFOGRAPHIC:" for generated visuals (frameworks, architectures, digital twins, data flows, system diagrams)

Real-world photo prompts should describe: cinematic lighting, professional photography, infrastructure settings, no text/logos.
Infographic prompts should describe: dark background, teal accents, clean lines, consulting-style diagram, minimal icons.

═══════════════════════════════════
VISUAL DESIGN
═══════════════════════════════════

Background: Dark gradient or clean modern background.
Accent: Teal/cyan (#2ECDA7) highlights for key words.
Visual elements: network lines, data flow graphics, minimal icons, infrastructure diagrams, abstract technology shapes.
Background visuals must remain subtle — text must dominate.

${langInstruction}

DESIGN STYLE: ${styleInstruction}

═══════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════

For each slide return:
- slide_number (sequential, starting from 1)
- slide_type: "hook" | "problem" | "stat" | "insight" | "framework_intro" | "framework_step" | "architecture" | "future_insight" | "cta"
- headline: Bold main text (6-10 words, NO system labels)
- supporting_text: Brief explanation (12-18 words, NO system labels)
- emphasis_words: array of 1-3 key words from headline
- visual_anchor: one of the allowed values or null
- layout: one of the available layouts
- image_prompt: Vivid prompt (80-150 words) prefixed with "PHOTO:" or "INFOGRAPHIC:". NO text/words/logos in the image.
- diagram_data: (framework/architecture slides only) { type: "sequential_flow" | "layered" | "circular" | "grid_2x2", nodes: string[] }

Also generate:
- carousel_title: Catchy title
- carousel_subtitle: Brief subtitle
- linkedin_caption: Ready-to-post LinkedIn caption (3-4 short paragraphs, professional advisory tone)
- hashtags: Array of 5-8 relevant hashtags
- total_slides: The total number of slides generated
- generation_checklist: {
    "explainer_format": "Option A | Option B | Option C",
    "stage_coverage": { "stage_name": "slide_N", ... },
    "explainer_slide_count": number,
    "terminology_consistent": true/false,
    "narrative_continuous": true/false
  }

OUTPUT: Valid JSON only: { "slides": [...], "carousel_title": "...", "carousel_subtitle": "...", "linkedin_caption": "...", "hashtags": [...], "total_slides": N, "generation_checklist": {...} }

BANNED WORDS: "delve," "tapestry," "landscape," "synergy," "leverage" (verb), "holistic," "robust," "utilize"`;
}
