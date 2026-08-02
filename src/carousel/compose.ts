/**
 * Deterministic composition. No AI, no randomness: given what the plan can
 * actually fill, return the ordered slot manifest. The writer stage fills the
 * manifest; it never decides the shape.
 *
 * P7 change: a requested length is a TARGET, not a ceiling. When a role cannot
 * be filled from the material (no comparison figure, too few steps) it is
 * SUBSTITUTED with a role the material can carry, rather than dropped. Silently
 * handing back five slides when the member asked for seven is the bug this
 * replaces.
 */
import type { Archetype, DeckLength } from "./deckIR";

export interface ComposeInput {
  hasNumber: boolean;
  hasComparison: boolean;
  stepCount: number;
  lang: "en" | "ar";
}

export interface ManifestSlot {
  index: number;
  archetype: Archetype;
  /** Stable role name — "steps_1" etc. distinguish the split step slides. */
  role: string;
}

export interface ComposeResult {
  length: DeckLength;
  slots: ManifestSlot[];
}

type Role =
  | "cover" | "frame" | "evidence" | "definition" | "quote" | "benchmark"
  | "steps" | "steps_1" | "steps_2" | "steps_3" | "summary" | "close";

const ROLE_ARCHETYPE: Record<Role, Archetype> = {
  cover: "cover_hero",
  frame: "frame",
  evidence: "evidence",
  definition: "definition",
  quote: "quote",
  benchmark: "benchmark",
  steps: "steps",
  steps_1: "steps",
  steps_2: "steps",
  steps_3: "steps",
  summary: "frame",
  close: "close",
};

/** When a role cannot be filled, the first substitute that can is used. */
const SUBSTITUTES: Partial<Record<Role, Role[]>> = {
  benchmark: ["definition", "quote", "frame"],
  steps: ["definition", "quote", "frame"],
  steps_1: ["definition", "quote", "frame"],
  steps_2: ["quote", "definition", "frame"],
  steps_3: ["frame", "definition", "quote"],
  summary: ["frame", "definition", "quote"],
  evidence: ["definition", "quote", "frame"],
};

/** Roles a collision repair may reach for. Never cover, never close. */
const POOL: Role[] = ["definition", "quote", "frame", "evidence", "steps", "benchmark"];

function baseRoles(length: DeckLength): Role[] {
  if (length === 5) return ["cover", "frame", "evidence", "quote", "close"];
  if (length === 7) return ["cover", "frame", "evidence", "benchmark", "quote", "steps", "close"];
  // Steps are interleaved rather than stacked: three consecutive "steps"
  // slides would break INV-06 (no two adjacent slides share an archetype).
  return [
    "cover", "frame", "evidence", "steps_1", "definition",
    "steps_2", "benchmark", "steps_3", "quote", "close",
  ];
}

/** Can the plan actually fill this role? Never pad to hit a number. */
function canFill(role: Role, input: ComposeInput): boolean {
  switch (role) {
    case "benchmark":
      return input.hasComparison;
    case "steps":
      return input.stepCount >= 2;
    case "steps_1":
    case "steps_2":
    case "steps_3":
      return input.stepCount >= 3;
    default:
      // cover, close, frame, definition, quote, evidence and summary can always
      // be written from a signal's own explanation.
      return true;
  }
}

function resolve(role: Role, input: ComposeInput): Archetype {
  // Evidence needs a number. With none, the slide becomes a definition rather
  // than inventing a statistic.
  if (role === "evidence" && !input.hasNumber) return "definition";
  return ROLE_ARCHETYPE[role];
}

/** Build a role list of EXACTLY `target` entries, substituting what cannot be filled. */
function buildRoles(target: DeckLength, input: ComposeInput): Role[] {
  const roles = baseRoles(target).map((r) => {
    if (canFill(r, input)) return r;
    return (SUBSTITUTES[r] ?? []).find((s) => canFill(s, input)) ?? "definition";
  });

  // A comparison in the material must reach a benchmark slide (that is where
  // the chart lives). If substitution lost it, put one back.
  if (input.hasComparison && target >= 7 && !roles.includes("benchmark")) {
    for (let i = 2; i < roles.length - 1; i += 1) {
      if (roles[i] === "cover" || roles[i] === "close" || roles[i] === "evidence") continue;
      const prev = resolve(roles[i - 1], input);
      const next = i + 1 < roles.length ? resolve(roles[i + 1], input) : null;
      if (prev !== "benchmark" && next !== "benchmark") { roles[i] = "benchmark"; break; }
    }
  }

  // INV-06 repair: no two adjacent slides share an archetype.
  for (let i = 1; i < roles.length - 1; i += 1) {
    if (resolve(roles[i], input) !== resolve(roles[i - 1], input)) continue;
    const prev = resolve(roles[i - 1], input);
    const next = resolve(roles[i + 1], input);
    const fix = POOL.find(
      (r) => canFill(r, input) && resolve(r, input) !== prev && resolve(r, input) !== next,
    );
    if (fix) roles[i] = fix;
  }
  // The close slide is fixed; if the slide before it collides, move that one.
  const last = roles.length - 1;
  if (last > 1 && resolve(roles[last - 1], input) === resolve(roles[last], input)) {
    const fix = POOL.find((r) => canFill(r, input) && resolve(r, input) !== resolve(roles[last], input));
    if (fix) roles[last - 1] = fix;
  }
  return roles;
}

/**
 * With a `target`, that length is honoured and the manifest is filled by
 * substitution. Without one, Aura picks the longest length the material can
 * carry with no substitution at all.
 */
export function compose(input: ComposeInput, target?: DeckLength): ComposeResult {
  const length: DeckLength = target
    ?? (([10, 7, 5] as DeckLength[]).find((l) => baseRoles(l).every((r) => canFill(r, input))) ?? 5);
  const roles = buildRoles(length, input);
  return {
    length,
    slots: roles.map((role, index) => ({ index, role, archetype: resolve(role, input) })),
  };
}
