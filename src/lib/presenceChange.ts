/**
 * What moved since the last LinkedIn read.
 *
 * Pure. No React, no network. Takes two already-scored presence row sets (the
 * current snapshot and the previous one) and returns the segments of ONE quiet
 * line. States the fact; never praises, never scolds, never restates a value
 * that did not move. A drop is reported in the same register as a rise.
 */

import type { PresenceRow } from "@/lib/presenceHealth";

export interface ChangeSegment {
  text: string;
  /** Numbers render in IBM Plex Mono at the call site. */
  mono?: boolean;
}

const MAX_CHANGES = 3;

/** "152 words" → { n: 152, unit: "words" }. Null when the fact is not numeric. */
function parseFact(fact: string): { n: number; unit: string } | null {
  const m = /^(\d[\d,]*)\s*(.*)$/.exec(fact.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { n, unit: (m[2] || "").trim() };
}

function factSegments(label: string, prev: PresenceRow, cur: PresenceRow): ChangeSegment[] | null {
  if (prev.fact === cur.fact) return null;
  const a = parseFact(prev.fact);
  const b = parseFact(cur.fact);
  if (a && b && a.unit === b.unit) {
    const seg: ChangeSegment[] = [
      { text: `${label} ` },
      { text: String(a.n), mono: true },
      { text: " → " },
      { text: String(b.n), mono: true },
    ];
    if (b.unit) seg.push({ text: ` ${b.unit}` });
    return seg;
  }
  /* Shapes that are not a single figure ("3 of 5 roles described") read whole. */
  return [{ text: `${label} ` }, { text: prev.fact, mono: true }, { text: " → " }, { text: cur.fact, mono: true }];
}

export interface PresenceChangeInput {
  currentRows: PresenceRow[];
  previousRows: PresenceRow[];
  currentSum: number;
  previousSum: number;
  currentWord: string;
  previousWord: string;
  /** Formatted date of the snapshot being compared against — the baseline may
   *  not be the immediately preceding read, so the line names it. */
  baselineDate?: string | null;
  /** Set only when the top subject's match state actually moved. */
  themeMove?: { theme: string; from: string; to: string } | null;
}

/** Empty array means: render nothing at all. */
export function buildPresenceChange(input: PresenceChangeInput): ChangeSegment[] {
  const { currentRows, previousRows, currentSum, previousSum, currentWord, previousWord, themeMove } = input;

  const prevByKey = new Map(previousRows.map((r) => [r.key, r]));
  const fieldChanges: { weight: number; size: number; segments: ChangeSegment[] }[] = [];

  for (const cur of currentRows) {
    const prev = prevByKey.get(cur.key);
    if (!prev) continue;
    const segments = factSegments(cur.label, prev, cur);
    if (!segments) continue;
    const a = parseFact(prev.fact);
    const b = parseFact(cur.fact);
    fieldChanges.push({
      weight: Math.abs(cur.score - prev.score),
      size: a && b ? Math.abs(b.n - a.n) : 0,
      segments,
    });
  }

  fieldChanges.sort((x, y) => (y.weight - x.weight) || (y.size - x.size));

  const parts: ChangeSegment[][] = [];
  const totalMoved = currentSum !== previousSum;
  const roomForFields = totalMoved ? MAX_CHANGES - 1 : MAX_CHANGES;
  const shownFields = fieldChanges.slice(0, Math.max(roomForFields, 0));
  for (const f of shownFields) parts.push(f.segments);

  if (totalMoved) {
    const total: ChangeSegment[] = [
      { text: "Presence " },
      { text: String(previousSum), mono: true },
      { text: " → " },
      { text: String(currentSum), mono: true },
    ];
    /* The word only earns a mention when the word itself changed. */
    if (currentWord !== previousWord) total.push({ text: ` — ${previousWord} to ${currentWord}` });
    parts.push(total);
  }

  if (parts.length === 0 && !themeMove) return [];

  const hidden = fieldChanges.length - shownFields.length;

  const out: ChangeSegment[] = [];
  if (parts.length > 0) {
    out.push({ text: "Since your last read: " });
    parts.forEach((p, i) => {
      out.push(...p);
      out.push({ text: i === parts.length - 1 && hidden <= 0 ? ". " : ". " });
    });
    if (hidden > 0) {
      out.push({ text: "And " }, { text: String(hidden), mono: true }, { text: hidden === 1 ? " more. " : " more. " });
    }
  }

  if (themeMove) {
    out.push({ text: `${themeMove.theme} moved from ${themeMove.from} to ${themeMove.to}.` });
  }

  /* Trim the trailing space on the last segment. */
  const last = out[out.length - 1];
  if (last && !last.mono) out[out.length - 1] = { ...last, text: last.text.replace(/\s+$/, "") };
  return out;
}

export default buildPresenceChange;
