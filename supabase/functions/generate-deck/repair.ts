/**
 * Deterministic repair.
 *
 * Three invariants describe damage a machine can undo without inventing words:
 * a hero line over budget, more than one emphasis on a slide, and a statistic
 * with nothing to attribute it to. Regenerating a whole deck over any of them
 * was the reason members were staring at "Aura would not ship this deck".
 */
import { plainText, type DeckIR } from "./deckIR.ts";
import { heroBudget, MARKER_RE } from "./invariants.ts";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const LATIN_CHAR_RE = /[A-Za-z]/;
const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** The keys whose text nodes carry runs, shared by the scrub and split passes. */
const TEXT_KEYS = [
  "chip", "subline", "headline", "stat_label", "source", "callout_label",
  "callout_body", "quote", "term", "term_def", "cta_pill", "body",
  "checklist", "hero_lines",
] as const;

/**
 * INV-07 — split one run into maximal same-script spans.
 *
 * Digits, spaces and punctuation carry no script of their own, so they attach
 * to the preceding span (or, at the head of the string, to the following one).
 * Concatenating the results reproduces `t` exactly, so visual order — and with
 * it the bidi resolution the renderer and the PDF export rely on — is unchanged.
 * Returns null when the run is already single-script: no churn.
 */
export function splitMixedScriptRun(run: any): any[] | null {
  const t = String(run?.t ?? "");
  if (!t) return null;

  const spans: Array<{ t: string; lang: "en" | "ar" }> = [];
  let pending = "";          // neutral characters with no span to attach to yet
  let current: { t: string; lang: "en" | "ar" } | null = null;

  for (const ch of t) {
    const lang: "en" | "ar" | null =
      LATIN_CHAR_RE.test(ch) ? "en" : ARABIC_CHAR_RE.test(ch) ? "ar" : null;

    if (lang === null) {
      if (current) current.t += ch;
      else pending += ch;
      continue;
    }
    if (current && current.lang === lang) { current.t += ch; continue; }
    current = { t: pending + ch, lang };
    pending = "";
    spans.push(current);
  }
  // A string of nothing but neutrals keeps its original language.
  if (pending) {
    if (spans.length) spans[spans.length - 1].t += pending;
    else return null;
  }

  if (spans.length <= 1) return null;
  return spans
    .filter((s) => s.t.trim().length > 0)
    .map((s) => ({ ...run, t: s.t, lang: s.lang }));
}

/** Trim a run list to `budget` characters, on a word boundary where possible. */
function trimRuns(runs: any[], budget: number): any[] {
  const out: any[] = [];
  let used = 0;
  for (const r of runs) {
    const t = String(r?.t ?? "");
    if (used >= budget) break;
    const room = budget - used;
    if (t.length <= room) { out.push(r); used += t.length; continue; }
    const cut = t.slice(0, room);
    const boundary = cut.lastIndexOf(" ");
    const kept = (boundary > 3 ? cut.slice(0, boundary) : cut).trim();
    if (kept) out.push({ ...r, t: kept });
    break;
  }
  return out.length ? out : [{ ...(runs[0] ?? { lang: "en" }), t: String(runs[0]?.t ?? "").slice(0, budget).trim() }];
}

export function repairDeck(ir: DeckIR): { deck: DeckIR; repaired: string[] } {
  const repaired: string[] = [];
  const deck: DeckIR = JSON.parse(JSON.stringify(ir));

  for (const slide of deck.slides ?? []) {
    const where = `slide ${slide.index} (${slide.archetype})`;
    const s: any = slide.slots;

    // INV-20 — a marker glyph is mechanically removable. Strip it and collapse
    // the whitespace it leaves behind; a node emptied by the strip is dropped
    // so the blocking emptiness check can see it.
    const scrubNode = (node: any) => {
      if (!node?.runs) return;
      for (const run of node.runs) {
        MARKER_RE.lastIndex = 0;
        if (!MARKER_RE.test(String(run.t ?? ""))) continue;
        run.t = String(run.t).replace(MARKER_RE, " ").replace(/\s{2,}/g, " ");
        repaired.push(`INV-20: ${where} stripped a symbol marker from slide text.`);
      }
      node.runs = node.runs.filter((r: any) => String(r.t ?? "").trim().length > 0);
      if (!node.runs.length) node.runs = null;
    };
    const scrubKey = (key: string) => {
      const v = s[key];
      if (Array.isArray(v)) {
        for (const n of v) scrubNode(n);
        const kept = v.filter((n: any) => n?.runs?.length);
        if (kept.length) s[key] = kept; else delete s[key];
      } else if (v?.runs) {
        scrubNode(v);
        if (!v.runs?.length) delete s[key];
      }
    };
    for (const key of TEXT_KEYS) scrubKey(key);
    for (const item of s.media?.chart?.series ?? []) scrubNode(item.label);

    // INV-07 — direction integrity. A run marked "ar" that carries a Latin
    // brand is blocked by the checker and the model will not give the brand
    // up, so the split the prompt asks for is performed mechanically instead.
    let splitAny = false;
    const splitNode = (node: any) => {
      if (!node?.runs?.length) return;
      const out: any[] = [];
      for (const run of node.runs) {
        const parts = splitMixedScriptRun(run);
        if (parts) { out.push(...parts); splitAny = true; } else out.push(run);
      }
      node.runs = out.filter((r: any) => String(r.t ?? "").trim().length > 0);
    };
    for (const key of TEXT_KEYS) {
      const v = s[key];
      if (Array.isArray(v)) for (const n of v) splitNode(n);
      else if (v?.runs) splitNode(v);
    }
    for (const item of s.media?.chart?.series ?? []) splitNode(item.label);
    if (splitAny) repaired.push(`INV-07: ${where} split a mixed-script run.`);

    // INV-13 — a hero line over budget is trimmed, never a reason to fail.
    for (const line of s.hero_lines ?? []) {
      const text = plainText(line);
      const budget = heroBudget(ARABIC_RE.test(text) ? "ar" : "en", deck.template);
      if (text.length > budget) {
        line.runs = trimRuns(line.runs ?? [], budget);
        repaired.push(`INV-13: ${where} hero line trimmed to ${budget} characters.`);
      }
    }

    // INV-05 — a statistic with no source is dropped rather than attributed to no one.
    if (s.stat_value && !s.source) {
      delete s.stat_value;
      delete s.stat_label;
      repaired.push(`INV-05: ${where} dropped an unsourced statistic.`);
    }

    // INV-04 — exactly one emphasis. Keep the first, mute the rest.
    let emphasisUsed = Boolean(s.stat_value);
    for (const line of s.hero_lines ?? []) {
      if (!line.highlight) continue;
      if (emphasisUsed) { delete line.highlight; repaired.push(`INV-04: ${where} removed a second highlight.`); }
      else emphasisUsed = true;
    }
    for (const item of s.media?.chart?.series ?? []) {
      if (item.emphasis !== "accent" && item.emphasis !== "alert") continue;
      if (emphasisUsed) { item.emphasis = "none"; repaired.push(`INV-04: ${where} muted a second chart emphasis.`); }
      else emphasisUsed = true;
    }

    // INV-04 floor — the checker counts stat_value, highlighted hero lines and
    // chart series marked "alert". A benchmark whose only emphasis is an accent
    // peak therefore counts zero and blocks. Recount on the checker's own terms
    // and, only when the count is exactly zero, add the one missing emphasis.
    const countEmphasis = () =>
      (s.stat_value ? 1 : 0)
      + (s.hero_lines ?? []).filter((l: any) => l.highlight).length
      + (s.media?.chart?.series ?? []).filter((x: any) => x.emphasis === "alert").length;

    if (countEmphasis() === 0) {
      const series: any[] = s.media?.chart?.series ?? [];
      if (s.hero_lines?.length) {
        // Preferred: a highlighted hero line introduces no new colour.
        s.hero_lines[0].highlight = true;
        repaired.push(`INV-04: ${where} added the missing emphasis.`);
      } else if (series.length) {
        // Fallback for chart-only slides: promote the single peak. "alert" is
        // red, so it is never used where a hero line could have carried it.
        let peak = series[0];
        for (const item of series) {
          if (Math.abs(Number(item?.value ?? 0)) > Math.abs(Number(peak?.value ?? 0))) peak = item;
        }
        for (const item of series) if (item !== peak && item.emphasis === "alert") item.emphasis = "none";
        peak.emphasis = "alert";
        repaired.push(`INV-04: ${where} added the missing emphasis.`);
      }
    }
  }

  return { deck, repaired };
}
