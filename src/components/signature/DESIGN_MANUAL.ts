// MIRRORED CONSTANT — canonical source: src/components/signature/DESIGN_MANUAL.ts
// The BRAIN_RULEBOOK below is duplicated verbatim inside
// supabase/functions/signature-suggest/index.ts because Edge Functions cannot
// import from the app bundle. Update BOTH together — any drift is a bug.
//
// This file is the canonical Signature design handbook. It has two exports:
//   • DESIGN_MANUAL — the full 10-chapter craft handbook (dos / don'ts) that
//     future contributors must consult before touching a renderer.
//   • BRAIN_RULEBOOK — the distilled runtime rulebook injected into the
//     signature-suggest design-mode system prompt (must equal the EF copy).

export interface ManualChapter {
  chapter: string;
  dos: string[];
  donts: string[];
}

export const DESIGN_MANUAL: ManualChapter[] = [
  {
    chapter: "CH1 COMPOSITION",
    dos: [
      "Place text in the calmest, lowest-detail zone.",
      "Respect rule-of-thirds anchoring.",
      "Keep clear space around the subject.",
      "Let one element dominate each card.",
    ],
    donts: [
      "Place text over or touching a face.",
      "Center-float text in dead space.",
      "Fight the photo's leading lines.",
      "Crowd two focal points.",
    ],
  },
  {
    chapter: "CH2 ENGLISH TYPE",
    dos: [
      "Sizes only from the modular scale.",
      "Line-height 1.45 for reading text, 1.1 for display.",
      "Caps + tracking for mono labels only.",
      "Serif (Newsreader) for voice, mono (IBM Plex) for data.",
    ],
    donts: [
      "Track body text.",
      "Use more than two text sizes in one zone.",
      "Leave a one-word last line.",
      "Hyphenate.",
    ],
  },
  {
    chapter: "CH3 ARABIC TYPE",
    dos: [
      "Cairo exclusively.",
      "Line-height 1.8.",
      "Balanced line lengths.",
      "Compositions that enter from the right.",
      "+1px vs EN equivalents.",
    ],
    donts: [
      "Letter-space Arabic EVER (breaks ligatures).",
      "Uppercase-transform Arabic.",
      "Break a word across lines.",
      "Set Arabic in mono or serif.",
      "Mirror EN layout blindly instead of designing RTL.",
    ],
  },
  {
    chapter: "CH4 COLOR & EMPHASIS",
    dos: [
      "Exactly one emphasized phrase per line (4+ words), chosen editorially — the tension pair, the number, or the payoff.",
      "Contrast-check the accent against its real background.",
      "Oxblood accents on bright zones, mood accents on dark.",
    ],
    donts: [
      "Emphasize articles or filler.",
      "Use two accents in one block.",
      "Set teal on bright sky.",
      "Rainbow anything.",
      "Emphasize lines under 4 words.",
    ],
  },
  {
    chapter: "CH5 LIGHT & SCRIMS",
    dos: [
      "Feathered stacked-alpha scrims (light falling off).",
      "Vertical gradient fades on lower zones.",
      "A whisper shadow (0/1.5px, 35%) under light text on photos.",
      "Scrim behind the text block only.",
    ],
    donts: [
      "Hard-edged boxes.",
      "Full-canvas darkening.",
      "Shadows under dark ink text.",
      "Scrim when the zone is genuinely quiet.",
    ],
  },
  {
    chapter: "CH6 HIERARCHY & SPACING",
    dos: [
      "≥2 modular steps between name and caption.",
      "All vertical gaps on the 8pt grid.",
      "Nested radius = outer − padding.",
      "One clear reading order top to bottom.",
    ],
    donts: [
      "Let two elements compete at similar sizes.",
      "Eyeball a gap.",
      "Mirror inner and outer radii.",
    ],
  },
  {
    chapter: "CH7 PHOTOS",
    dos: [
      "Full-bleed edge to edge.",
      "Crop anchored to the eyes.",
      "Honor the photo's light direction when placing text.",
      "Data-URL inline before export.",
    ],
    donts: [
      "Box a photo in a frame with dead margins.",
      "Letterbox.",
      "Stretch or distort.",
      "Crop through a chin or hairline.",
      "Leave blob: URLs in export paths.",
    ],
  },
  {
    chapter: "CH8 BRAND",
    dos: [
      "Horizon-Eye + AURA wordmark small at the bottom inline-end corner, always.",
      "The gradient spine on every card.",
      "Quiet premium register in every generated word.",
    ],
    donts: [
      "Enlarge the logo.",
      "Omit or break the spine.",
      "Use banned words (authority as noun, thought leader, personal brand, leverage, elevate, unlock, empower, seamless, game-changer, delve, journey).",
      "Exclamation marks, emojis, or hashtags on cards.",
    ],
  },
  {
    chapter: "CH9 BILINGUAL CONDUCT",
    dos: [
      "Full mirror on language switch (anchors, marks, zones).",
      "Bidi-isolate Latin/digit runs inside Arabic.",
      "Identical quality bar for both languages.",
      "Prefer right-entry zones for Arabic, left-entry for English at equal quality.",
    ],
    donts: [
      "Treat Arabic as translated English.",
      "Ship an Arabic card you wouldn't ship in English.",
    ],
  },
  {
    chapter: "CH10 THE EMPLOYEE'S CHARACTER",
    dos: [
      "Always commit to a decision.",
      "Give one craft-grounded reason (contrast, balance, hierarchy, face clearance) per option.",
      "Bring three MEANINGFULLY different compositions.",
      "Read and respect the client's taste history.",
      "Self-critique as a 20-year art director before answering.",
    ],
    donts: [
      "Shrug or return empty when a decision is required.",
      "Produce three variants of the same idea.",
      "Argue with an override — record it and adapt.",
      "Break the grid or the laws for novelty.",
    ],
  },
];

// BRAIN_RULEBOOK — distilled runtime rules for the signature-suggest design
// mode. Keep terse, imperative, ≈25 lines. MUST match the EF copy verbatim.
export const BRAIN_RULEBOOK: string = `Place text in the calmest, lowest-detail zone. Never over or touching a face.
Respect rule-of-thirds; honor the photo's leading lines and light direction.
Bias cropFocusY toward the subject's eyes; away from busy edges.
scrim: 'none' only when the zone is truly quiet AND textColor is 'ink' over a bright area; 'soft' for moderately calm; 'strong' when in doubt.
textColor: 'ink' ONLY when the zone is very bright AND scrim === 'none'. Otherwise 'paper'.
Emphasis: exactly one phrase per line when the line has 4+ words; [] otherwise. The phrase MUST be a verbatim substring — a tension pair, a number, or the payoff. Never articles or filler.
Emphasis will render in an accent color — pick phrases where the accent will contrast with the background.
Oxblood accents on bright zones, mood accents on dark. Never teal on bright sky.
Mood ('oxblood'|'teal'|'amber'|null) follows the photo's overall temperature.
Arabic layouts read from the RIGHT — prefer right-side zones for Arabic and left-side for English at equal quality.
Never letter-space Arabic (breaks ligatures). Never uppercase-transform Arabic. Keep Arabic lines balanced in length.
Bidi-isolate Latin/digit runs inside Arabic sentences.
Layouts render on a strict modular type scale, 8pt spacing grid, and 1.45/1.8 line-height law — reason in real craft terms (contrast, balance, hierarchy, face clearance); never suggest breaking the grid.
Banned words in any language: authority (as noun), thought leader, personal brand, leverage, elevate, unlock, empower, seamless, game-changer, delve, journey. No emojis, hashtags, or exclamation marks.
Return THREE meaningfully different compositions (A, B, C): differ on textZone, scrim, or textColor — never three variants of the same idea.
Read the client's taste history (moods chosen, options picked, emphasis toggled) and adapt; when overridden, record and adapt — never argue.
Silently self-critique each option as a 20-year art director (contrast, balance, face clearance, readability) and fix weaknesses before answering.
Always commit to a decision. Give ONE short craft-grounded reason per option. Never shrug, never return empty.`;