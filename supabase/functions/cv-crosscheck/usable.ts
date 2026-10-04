/** One model call, then code repairs or drops. Pure: no network, no model. */
import { normaliseCrosscheck } from "./normalise.ts";
import { spanIsWrong, SENTENCE_SPLIT } from "./spans.ts";
import { sourceNumbers, unsupportedNumbers } from "./figures.ts";
import { stripIntentions } from "./intentions.ts";

export const AURA_CAN = ["capture_evidence", "draft_post", "suggest_headline", "track_signal"];
/** Whole word or phrase, case-insensitive; letters (Latin or Arabic) and digits on either side break the match. */
export function phraseIn(text: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export const PLATITUDES = [
  "quantify your achievements", "action verbs", "tailor your cv",
  "ats", "highlight your strengths", "showcase",
];

const PROSE_KEYS = ["headline_finding", "defensibility", "cv_is_behind", "profile_vs_voice", "reading_the_shape", "the_hard_truth", "peer_comparison"];

/** The model-written prose fields only — quotes, paste-ready text and enums stay out. */
export function arabicProse(r: any): Record<string, unknown> {
  const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => typeof o?.[k] === "string" || Array.isArray(o?.[k])).map((k) => [k, o[k]]));
  return {
    ...pick(r, PROSE_KEYS),
    findings: (Array.isArray(r?.findings) ? r.findings : []).map((f: any) => pick(f, ["what", "why_it_matters", "do_this", "what_you_lose"])),
    recommendations: (Array.isArray(r?.recommendations) ? r.recommendations : []).map((x: any) => pick(x, ["action", "why_now"])),
  };
}

export function allText(v: unknown): string {
  if (typeof v === "string") return ` ${v} `;
  if (Array.isArray(v)) return v.map(allText).join(" ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(allText).join(" ");
  return "";
}

/** The paste-ready English fields only: every finding's rewrite and the headline suggestion. */
export function pasteText(result: any): string {
  const parts: string[] = [];
  if (typeof result?.headline_suggestion === "string") parts.push(result.headline_suggestion);
  for (const f of Array.isArray(result?.findings) ? result.findings : []) if (typeof f?.rewrite === "string") parts.push(f.rewrite);
  return parts.map((x) => ` ${x} `).join(" ");
}

/** Share of Arabic letters among all letters in the joined prose of the whole object. */
export function wholeArabicShare(result: any): number {
  const joined = allText(arabicProse(result));
  const ar = (joined.match(/[\u0621-\u064A\u0671-\u06D3]/g) ?? []).length;
  const lat = (joined.match(/[A-Za-z]/g) ?? []).length;
  return ar + lat === 0 ? 0 : ar / (ar + lat);
}

export type UsableOpts = {
  lang: "ar" | "en";
  bannedWords: string[];
  hasBanned: (text: string, words: string[]) => boolean;
  truncated?: boolean;
  /** The member's own material exactly as sent to the model; enables the figures guard. */
  source?: string;
};

export type UsableOut = {
  result: any;
  notes: string[];
  kept: number;
  dropped: number;
  failure: null | "no_usable_findings" | "not_arabic";
  rewritesRemoved: number;
  defensibilityDropped: number;
  intentionSentencesRemoved: number;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A square-bracket instruction left for the member to fill in: not paste-ready. */
export const BRACKET_GAP = /\[[^\]]{3,}\]/;

/** Placeholder words a model writes instead of leaving a field empty. */
const BLANK_WORDS = new Set(["", "absent", "null", "none", "n/a", "-"]);
export function isBlankValue(v: unknown): boolean {
  return v == null || (typeof v === "string" && BLANK_WORDS.has(v.trim().toLowerCase()));
}

export function makeUsable(parsed: any, opts: UsableOpts): UsableOut {
  const notes: string[] = [];
  if (opts.truncated) notes.push("truncated_output");
  const p: any = parsed && typeof parsed === "object" ? parsed : {};
  /* Figures guard: paste-ready lines may only carry numbers found in the source. */
  const src = typeof opts.source === "string" ? sourceNumbers(opts.source) : null;
  const bad = (t: unknown) => (src && typeof t === "string" ? unsupportedNumbers(t, src) : []);
  let rewritesRemoved = 0, defensibilityDropped = 0, intentionSentencesRemoved = 0;
  /* Intentions guard (after figures): "what I want next / why I am leaving" must come from the source. */
  const intent = (t: unknown, note: string): string | null => {
    if (typeof opts.source !== "string" || typeof t !== "string") return t as any;
    const r = stripIntentions(t, opts.source);
    for (const _ of r.removed) { intentionSentencesRemoved++; notes.push(note); }
    return r.text;
  };

  /** The offending stock phrase, named (whole word or phrase only). Drops or nulls. */
  const offender = (text: unknown): string | null => {
    if (typeof text !== "string" || !text.trim()) return null;
    const plat = PLATITUDES.find((x) => phraseIn(text, x));
    return plat ? `platitude:${plat}` : null;
  };
  /** A brand banned word: KnownBy's own marketing rule, so in the CV comparison it is a note only. */
  const noteBanned = (text: unknown, field: string) => {
    if (typeof text !== "string" || !text.trim()) return;
    const words = opts.bannedWords.length ? opts.bannedWords : [];
    const w = words.find((x) => opts.hasBanned(text, [x]));
    if (w) notes.push(`noted:banned:${w}@${field}`);
    else if (!words.length && opts.hasBanned(text, words)) notes.push(`noted:banned:default_list@${field}`);
  };

  /* Findings: drop, downgrade, or strip a field. */
  const before: any[] = Array.isArray(p.findings) ? p.findings : [];
  const kept: any[] = [];
  for (const f of before) {
    let why: string | null = null;
    if (!f || !s(f.what)) why = "what_empty";
    else if (!s(f.what_you_lose)) why = "what_you_lose_missing";
    else if (opts.lang === "en") {
      for (const k of ["what", "why_it_matters", "do_this", "what_you_lose"]) {
        const o = offender(f[k]);
        if (o) { why = `${o}@${k}`; break; }
      }
      if (!why) for (const k of ["what", "why_it_matters", "do_this", "what_you_lose", "rewrite"]) noteBanned(f[k], k);
    }
    if (!why && allText(f).split(SENTENCE_SPLIT).some(spanIsWrong)) why = "span_wrong";
    if (why) { notes.push(`dropped_finding:${why}`); continue; }
    /* "Absent" on one side is a real reading; both sides blank happens when the finding comes from posts. */
    if (isBlankValue(f.evidence?.cv_line) && isBlankValue(f.evidence?.profile_line)) notes.push("evidence_both_absent");
    if (isBlankValue(f.rewrite)) f.rewrite = null;
    if (typeof f.rewrite === "string" && BRACKET_GAP.test(f.rewrite)) { f.rewrite = null; rewritesRemoved++; notes.push("rewrite_removed:bracket_gap"); }
    const badRw = bad(f.rewrite);
    if (badRw.length) { f.rewrite = null; rewritesRemoved++; notes.push(`rewrite_removed:unsupported_figure:${badRw.join(",")}`); }
    const rwOff = offender(f.rewrite);
    if (rwOff) { f.rewrite = null; rewritesRemoved++; notes.push(`rewrite_removed:${rwOff}`); }
    if (typeof f.rewrite === "string") f.rewrite = intent(f.rewrite, "rewrite_sentence_removed:intention");
    if (f.aura_can != null && !AURA_CAN.includes(String(f.aura_can))) { delete f.aura_can; notes.push("removed:finding_aura_can"); }
    if (f.weight === "high" && !s(f.rewrite)) { f.weight = "medium"; notes.push("downgraded:rewrite_missing"); }
    kept.push(f);
  }
  p.findings = kept;

  /* Recommendations: drop incomplete, strip bad aura_can, at most five, fewer than three accepted. */
  const recs: any[] = [];
  for (const r of Array.isArray(p.recommendations) ? p.recommendations : []) {
    if (!r || !s(r.action) || !s(r.why_now)) { notes.push("dropped_recommendation:incomplete"); continue; }
    if (opts.lang === "en") {
      let o: string | null = null;
      for (const [k, v] of Object.entries(r)) { o = offender(v); if (o) { o = `${o}@${k}`; break; } }
      if (o) { notes.push(`dropped_recommendation:${o}`); continue; }
      for (const [k, v] of Object.entries(r)) noteBanned(v, k);
    }
    if (r.aura_can != null && !AURA_CAN.includes(String(r.aura_can))) { delete r.aura_can; notes.push("removed:recommendation_aura_can"); }
    recs.push(r);
  }
  if (recs.length > 5) { recs.length = 5; notes.push("recommendations_trimmed"); }
  if (recs.length < 3) notes.push(`recommendations_short:${recs.length}`);
  p.recommendations = recs;

  /* Single fields and lists (English prose only is scanned; Arabic prose is judged by the Arabic checks). */
  const proseScanned = opts.lang === "en";
  if (!s(p.the_hard_truth)) { if (p.the_hard_truth !== null) notes.push("nulled:the_hard_truth"); p.the_hard_truth = null; }
  for (const k of ["defensibility", "cv_is_behind"]) {
    if (!Array.isArray(p[k])) continue;
    const nAll = p[k].length;
    p[k] = p[k].filter((x: unknown) => !isBlankValue(x));
    if (p[k].length < nAll) notes.push(`dropped_blank:${k}`);
    const n = p[k].length;
    p[k] = p[k].filter((x: unknown) => {
      const o = proseScanned ? offender(x) : null;
      if (o) notes.push(`dropped_item:${o}@${k}`);
      else if (proseScanned) noteBanned(x, k);
      return !o;
    });
    void n;
  }
  for (const k of ["the_hard_truth", "profile_vs_voice", "reading_the_shape", "peer_comparison"]) {
    const o = proseScanned ? offender(p[k]) : null;
    if (o) { p[k] = null; notes.push(`nulled:${o}@${k}`); }
    else if (proseScanned) noteBanned(p[k], k);
  }
  if (p.headline_suggestion !== undefined && isBlankValue(p.headline_suggestion)) p.headline_suggestion = null;
  if (typeof p.headline_suggestion === "string" && BRACKET_GAP.test(p.headline_suggestion)) { p.headline_suggestion = null; notes.push("headline_removed:bracket_gap"); }
  const hlOff = offender(p.headline_suggestion);
  if (hlOff) { p.headline_suggestion = null; notes.push(`headline_removed:${hlOff}`); }
  else if (opts.lang === "en") noteBanned(p.headline_suggestion, "headline_suggestion");
  const badHl = bad(p.headline_suggestion);
  if (badHl.length) { p.headline_suggestion = null; notes.push(`headline_removed:unsupported_figure:${badHl.join(",")}`); }
  if (typeof p.headline_suggestion === "string") p.headline_suggestion = intent(p.headline_suggestion, "headline_sentence_removed:intention");
  if (Array.isArray(p.defensibility)) {
    p.defensibility = p.defensibility.filter((x: unknown) => {
      const b = bad(x);
      if (b.length) { defensibilityDropped++; notes.push(`dropped_defensibility:unsupported_figure:${b.join(",")}`); return false; }
      return true;
    });
  }

  if (!kept.length) return { result: p, notes, kept: 0, dropped: before.length, failure: "no_usable_findings", rewritesRemoved, defensibilityDropped, intentionSentencesRemoved };

  /* Exactly one do_first among what remains. */
  const { result, changes } = normaliseCrosscheck(p);
  notes.push(...changes);

  const hfOff = proseScanned ? offender(result.headline_finding) : null;
  if (proseScanned && !hfOff) noteBanned(result.headline_finding, "headline_finding");
  if (!s(result.headline_finding) || hfOff) {
    const first = result.findings.find((f: any) => f?.do_first === true) ?? result.findings[0];
    result.headline_finding = first.what;
    notes.push(hfOff ? `replaced:${hfOff}@headline_finding` : "replaced:headline_finding");
  }

  if (opts.lang === "ar" && wholeArabicShare(result) < 0.5) {
    return { result, notes, kept: kept.length, dropped: before.length - kept.length, failure: "not_arabic", rewritesRemoved, defensibilityDropped, intentionSentencesRemoved };
  }
  return { result, notes, kept: kept.length, dropped: before.length - kept.length, failure: null, rewritesRemoved, defensibilityDropped, intentionSentencesRemoved };
}
