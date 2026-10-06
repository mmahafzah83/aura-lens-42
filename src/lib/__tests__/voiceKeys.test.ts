import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";

/** Every Voice key used on the Your voice page exists in BOTH languages. */
const EN = en as Record<string, string>;
const AR = ar as Record<string, string>;
const ROOT = join(__dirname, "../..");
const FILES = [
  "components/voice/YourVoice.tsx", "components/voice/SpectrumRow.tsx", "components/voice/VoiceModes.tsx",
  "components/voice/VoiceRules.tsx", "components/voice/VariationEngine.tsx", "components/voice/WhatWorked.tsx",
  "components/voice/InfoTooltip.tsx", "components/common/CollapseBlock.tsx",
  "lib/voiceOverview.ts", "lib/voiceDna.ts", "lib/voiceOutcomes.ts", "lib/voiceText.ts",
  // Batch 9b — Teach and Test & improve
  "components/voice/TeachAura.tsx", "components/voice/TeachAuraCoverage.tsx", "components/voice/TeachAuraReview.tsx",
  "components/voice/TestImprove.tsx", "lib/teachAura.ts", "lib/voiceFeedback.ts", "lib/voiceFidelity.ts", "lib/voiceSample.ts",
];
const RE = /(["'`])(vo\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\1/g;

const used = new Set<string>();
for (const f of FILES) for (const m of readFileSync(join(ROOT, f), "utf8").matchAll(RE)) used.add(m[2]);

const FAMILIES: Record<string, string[]> = {
  "vo.mode": ["default", "executive", "thought_leadership", "educational", "personal", "contrarian"].flatMap((k) => [`${k}.label`, `${k}.blurb`]),
  "vo.ready": ["forming", "developing", "working", "reliable", "distinctive", "not_set_up"],
  "vo.hook": ["contrarian_claim", "number_first", "short_story", "question", "experience_led", "announcement", "other"],
  "vo.ending": ["question", "suspended", "reframe", "equation", "number", "cta", "other"],
  "vo.def.open": ["contrarian_claim", "number_first", "short_story", "question", "experience_led", "announcement", "other"],
  "vo.def.close": ["question", "suspended", "reframe", "equation", "number", "cta", "other"],
  "vo.kind": ["always", "never", "anchor"],
  "vo.src": ["learned", "user", "aura"],
  "vo.rsrc": ["openings", "endings", "phrases", "structure", "absences"],
  "vo.ta": ["stage0", "stage1", "stage2"],
  "vo.tl.cov": ["arabic", "english", "long", "short", "recent"],
  "vo.tl.gap": ["arabic", "english", "long", "short", "recent"],
  "vo.tc": ["sufficient", "thin", "missing"],
  "vo.tr": ["fAll", "fAside", "fArabic", "fOld"],
  "vo.ti": ["hYours", "hClose", "hOff", "hNot"],
  "vo.fb.v": ["sounds_like_me", "partly", "not_me", "too_formal", "too_generic", "too_aggressive", "would_never_say"],
  "vo.cl": ["your_post", "from_your_linkedin_export", "written_by_aura", "found_online", "added_by_you", "unknown_source",
    "you_set_this_aside", "aura_wrote_this", "only_a_fragment_of_text", "not_written_by_you", "too_short_to_read"],
  "vo.ex": ["no_text", "not_own_writing", "not_in_corpus", "no_metrics_yet", "no_performance_data", "other_measure", "too_new", "too_few_impressions"],
};
for (const [p, ks] of Object.entries(FAMILIES)) for (const k of ks) used.add(`${p}.${k}`);

describe("voice keys", () => {
  it("keeps approved placeholder omissions explicit", () => {
    const COUNT_DROPPED = new Set([
      "vo.ww.compared", // Arabic drops the count on purpose
    ]);
    expect(COUNT_DROPPED.has("vo.ww.compared")).toBe(true);
    expect(AR["vo.ww.compared"]).not.toContain("{{n}}");
    expect(AR["vo.tr.unsureMany"]).toContain("{{n}}");
  });
  it("finds the page's keys", () => expect(used.size).toBeGreaterThan(150));
  it("every key exists in en and ar", () => {
    expect([...used].filter((k) => !(k in EN))).toEqual([]);
    expect([...used].filter((k) => !(k in AR))).toEqual([]);
  });
  it("Arabic values carry no arrows, no «تم» and no Aura", () => {
    const bad = [...used].filter((k) => /[→←↳↲]|\bتم\b|Aura/.test(AR[k] ?? ""));
    expect(bad).toEqual([]);
  });
  it("English values never say Aura", () => {
    expect([...used].filter((k) => /Aura/.test(EN[k] ?? ""))).toEqual([]);
  });
});
