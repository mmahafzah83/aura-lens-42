/**
 * Deterministic repair.
 *
 * Three invariants describe damage a machine can undo without inventing words:
 * a hero line over budget, more than one emphasis on a slide, and a statistic
 * with nothing to attribute it to. Regenerating a whole deck over any of them
 * was the reason members were staring at "Aura would not ship this deck".
 */
import { plainText, type DeckIR } from "./deckIR.ts";
import { HERO_BUDGET } from "./invariants.ts";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

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

    // INV-13 — a hero line over budget is trimmed, never a reason to fail.
    for (const line of s.hero_lines ?? []) {
      const text = plainText(line);
      const budget = HERO_BUDGET[ARABIC_RE.test(text) ? "ar" : "en"];
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
  }

  return { deck, repaired };
}
