/** One model call, then code repairs or drops. Pure: no network, no model. */
import { normaliseCrosscheck } from "./normalise.ts";
import { spanIsWrong, SENTENCE_SPLIT } from "./spans.ts";
import { vocabText } from "./vocabText.ts";

export const AURA_CAN = ["capture_evidence", "draft_post", "suggest_headline", "track_signal"];
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
};

export type UsableOut = {
  result: any;
  notes: string[];
  kept: number;
  dropped: number;
  failure: null | "no_usable_findings" | "not_arabic";
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function makeUsable(parsed: any, opts: UsableOpts): UsableOut {
  const notes: string[] = [];
  if (opts.truncated) notes.push("truncated_output");
  const p: any = parsed && typeof parsed === "object" ? parsed : {};

  const offends = (text: string): boolean =>
    PLATITUDES.some((x) => text.toLowerCase().includes(x)) || opts.hasBanned(text, opts.bannedWords);
  /* Same texts the checks scanned: English everything but quotes; Arabic only paste-ready English. */
  const scan = (obj: any) => (opts.lang === "ar" ? pasteText(obj) : vocabText(obj));

  /* Findings: drop, downgrade, or strip a field. */
  const before: any[] = Array.isArray(p.findings) ? p.findings : [];
  const kept: any[] = [];
  for (const f of before) {
    let why: string | null = null;
    if (!f || !s(f.what)) why = "what_empty";
    else if (!s(f.what_you_lose)) why = "what_you_lose_missing";
    else if (!f.evidence || !s(f.evidence.cv_line) || !s(f.evidence.profile_line)) why = "evidence_missing";
    else if (offends(scan({ findings: [f] }))) why = "banned_or_platitude";
    else if (allText(f).split(SENTENCE_SPLIT).some(spanIsWrong)) why = "span_wrong";
    if (why) { notes.push(`dropped_finding:${why}`); continue; }
    if (f.aura_can != null && !AURA_CAN.includes(String(f.aura_can))) { delete f.aura_can; notes.push("removed:finding_aura_can"); }
    if (f.weight === "high" && !s(f.rewrite)) { f.weight = "medium"; notes.push("downgraded:rewrite_missing"); }
    kept.push(f);
  }
  p.findings = kept;

  /* Recommendations: drop incomplete, strip bad aura_can, at most five, fewer than three accepted. */
  const recs: any[] = [];
  for (const r of Array.isArray(p.recommendations) ? p.recommendations : []) {
    if (!r || !s(r.action) || !s(r.why_now)) { notes.push("dropped_recommendation:incomplete"); continue; }
    if (opts.lang === "en" && offends(vocabText(r))) { notes.push("dropped_recommendation:banned_or_platitude"); continue; }
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
    const n = p[k].length;
    p[k] = p[k].filter((x: unknown) => !(proseScanned && typeof x === "string" && offends(x)));
    if (p[k].length < n) notes.push(`dropped_item:${k}:${n - p[k].length}`);
  }
  for (const k of ["the_hard_truth", "profile_vs_voice", "reading_the_shape", "peer_comparison"]) {
    if (proseScanned && typeof p[k] === "string" && offends(p[k])) { p[k] = null; notes.push(`nulled:${k}`); }
  }
  if (typeof p.headline_suggestion === "string" && offends(p.headline_suggestion)) { p.headline_suggestion = null; notes.push("nulled:headline_suggestion"); }

  if (!kept.length) return { result: p, notes, kept: 0, dropped: before.length, failure: "no_usable_findings" };

  /* Exactly one do_first among what remains. */
  const { result, changes } = normaliseCrosscheck(p);
  notes.push(...changes);

  if (!s(result.headline_finding) || (proseScanned && offends(result.headline_finding))) {
    const first = result.findings.find((f: any) => f?.do_first === true) ?? result.findings[0];
    result.headline_finding = first.what;
    notes.push("replaced:headline_finding");
  }

  if (opts.lang === "ar" && wholeArabicShare(result) < 0.5) {
    return { result, notes, kept: kept.length, dropped: before.length - kept.length, failure: "not_arabic" };
  }
  return { result, notes, kept: kept.length, dropped: before.length - kept.length, failure: null };
}
