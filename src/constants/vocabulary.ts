/**
 * The single source of member-facing nouns.
 *
 * One word per thing, everywhere a member reads. Never re-inline a noun in a
 * component — import it from here so Home, the Record and onboarding agree.
 */

export const SIGNAL = { one: "signal", many: "signals", One: "Signal", Many: "Signals" } as const;

export const EVIDENCE = {
  one: "piece of evidence",
  many: "pieces of evidence",
  One: "Piece of evidence",
  Many: "Evidence",
} as const;

export const CAPTURE = { verbPast: "captured", noun: "capture", nounPlural: "captures" } as const;

export const STANDING = { label: "Your standing" } as const;

export function velocityWord(v: string | null | undefined): string {
  const s = String(v ?? "").toLowerCase();
  if (s === "accelerating" || s === "growing") return "growing";
  if (s === "declining" || s === "cooling") return "cooling";
  return "steady";
}

export const nSignals = (n: number): string => `${n} ${n === 1 ? SIGNAL.one : SIGNAL.many}`;

export const nEvidence = (n: number): string => `${n} ${n === 1 ? EVIDENCE.one : EVIDENCE.many}`;
