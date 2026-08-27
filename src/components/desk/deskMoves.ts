/**
 * deskMoves — nothing internal reaches the member, and nothing is claimed
 * unless it provably happened.
 *
 * Two jobs:
 *  1. Move chips: internal tool names are mapped to plain instructions, labels
 *     are capped at four words, and anything still machine-shaped is dropped.
 *  2. Claim guard: a sentence that says work was done is removed unless a
 *     verified action line proves it. Aura never reports its own work.
 */

/** Internal name → the words a member would actually say. */
const TOOL_LABELS: Record<string, string> = {
  save_draft: "Save this draft",
  open_drafts: "Open my drafts",
  open_surface: "Open my drafts",
  set_reminder: "Remind me tomorrow",
  search_my_graph: "Search my vault",
  search_vault: "Search my vault",
};

/** Machine-shaped: snake_case, camelCase run-ons, or a bare function call. */
const MACHINE = /^[a-z0-9]+(_[a-z0-9]+)+(\(\))?$/;

function fourWords(label: string): string {
  const words = label.trim().split(/\s+/);
  return words.length <= 4 ? words.join(" ") : words.slice(0, 4).join(" ");
}

/** At most three chips, plain words only, never a tool name. */
export function cleanMoves(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = String(r ?? "").trim().replace(/^[-•*\s]+/, "");
    if (!t) continue;
    const key = t.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const mapped = TOOL_LABELS[key];
    if (mapped) {
      if (!out.includes(mapped)) out.push(mapped);
    } else {
      if (MACHINE.test(t.toLowerCase())) continue; // malformed: dropped silently
      const label = fourWords(t);
      if (!out.includes(label)) out.push(label);
    }
    if (out.length === 3) break;
  }
  return out;
}

/** Language that asserts a write happened. Only a row id may earn it. */
const CLAIM =
  /\b(saved|i(?:'ve| have) saved|stored|added it|scheduled|reminder (?:is )?set|set a reminder|drafted it|created the draft|put it in your drafts|opened)\b/i;

export interface ClaimVerdict {
  /** The answer with unproven claims removed. */
  text: string;
  /** True when a claim was removed, so the honest line is shown instead. */
  stripped: boolean;
}

/**
 * Remove any sentence claiming work was done when no verified action proves it.
 * `verified` is the set of tools that came back ok with a real row.
 */
export function guardClaims(text: string, verified: string[]): ClaimVerdict {
  if (verified.length > 0) return { text, stripped: false };
  const src = String(text ?? "");
  if (!CLAIM.test(src)) return { text: src, stripped: false };
  let stripped = false;
  const kept = src
    .split(/(?<=[.!?])\s+/)
    .filter(s => {
      if (!CLAIM.test(s)) return true;
      stripped = true;
      return false;
    })
    .join(" ")
    .trim();
  return { text: kept, stripped };
}

/** What the member is told when the write did not happen. */
export const HONEST_FAILURE = "I could not save that. The draft is still here — try again?";
