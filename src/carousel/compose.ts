/**
 * Deterministic composition. No AI, no randomness: given what the plan can
 * actually fill, return the ordered slot manifest. The writer stage fills the
 * manifest; it never decides the shape.
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

/** Middle slots are dropped in this order when a length cannot be filled. */
const DROP_ORDER: Role[] = ["summary", "steps_3", "steps_2", "steps_1", "steps", "benchmark"];

function baseRoles(length: DeckLength): Role[] {
  if (length === 5) return ["cover", "frame", "evidence", "quote", "close"];
  if (length === 7) return ["cover", "frame", "evidence", "benchmark", "quote", "steps", "close"];
  // 10 = the seven, plus a standalone Definition, plus Steps split across three
  // single-step slides, plus a Summary. That arithmetic reaches eleven, so one
  // middle slot yields: Benchmark, because its comparison can ride on the
  // Evidence slide's chart while nothing else can absorb a Definition or a
  // Summary.
  return [
    "cover", "frame", "evidence", "definition",
    "quote", "steps_1", "steps_2", "steps_3", "summary", "close",
  ];
}

/** Can the plan actually fill this role? Never pad to hit a number. */
function canFill(role: Role, input: ComposeInput): boolean {
  switch (role) {
    case "evidence":
      // Without a number there is nothing to evidence — the slot becomes a
      // definition instead of an invented statistic.
      return true;
    case "benchmark":
      return input.hasComparison;
    case "steps":
      return input.stepCount >= 2;
    case "steps_1":
      return input.stepCount >= 3;
    case "steps_2":
      return input.stepCount >= 3;
    case "steps_3":
      return input.stepCount >= 3;
    case "definition":
      return true;
    case "summary":
      return input.stepCount >= 3 || input.hasComparison;
    default:
      return true;
  }
}

function resolve(role: Role, input: ComposeInput): Archetype {
  // Evidence needs a number. With none, the slide becomes a definition rather
  // than inventing a statistic.
  if (role === "evidence" && !input.hasNumber) return "definition";
  return ROLE_ARCHETYPE[role];
}

/** No two consecutive slides may share an archetype (INV-06). */
function collides(roles: Role[], input: ComposeInput): boolean {
  const seq = roles.map((r) => resolve(r, input));
  for (let i = 1; i < seq.length; i += 1) {
    // Split step slides are intentionally adjacent in the manifest; the writer
    // stage alternates them, so only non-step collisions matter here.
    const stepPair = roles[i].startsWith("steps") && roles[i - 1].startsWith("steps");
    if (!stepPair && seq[i] === seq[i - 1]) return true;
  }
  return false;
}

function fillableRoles(length: DeckLength, input: ComposeInput): Role[] | null {
  let roles = baseRoles(length).filter((r) => canFill(r, input));
  // Cover and close are always present.
  if (!roles.includes("cover") || !roles.includes("close")) return null;
  if (collides(roles, input)) {
    for (const drop of DROP_ORDER) {
      if (!collides(roles, input)) break;
      roles = roles.filter((r) => r !== drop);
    }
    if (collides(roles, input)) return null;
  }
  return roles.length === length ? roles : null;
}

/**
 * Choose the LONGEST length the plan can actually fill. When a length cannot
 * be filled without padding, fall to the next one down.
 */
export function compose(input: ComposeInput): ComposeResult {
  const candidates: DeckLength[] = [10, 7, 5];
  for (const length of candidates) {
    const roles = fillableRoles(length, input);
    if (roles) {
      return {
        length,
        slots: roles.map((role, index) => ({ index, role, archetype: resolve(role, input) })),
      };
    }
  }
  // Floor: a five-slide deck with the middle dropped to what is fillable.
  const roles = baseRoles(5).filter((r) => canFill(r, input));
  return {
    length: 5,
    slots: roles.map((role, index) => ({ index, role, archetype: resolve(role, input) })),
  };
}