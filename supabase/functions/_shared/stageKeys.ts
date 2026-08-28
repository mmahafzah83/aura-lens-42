/**
 * STAGE KEYS — one definition, imported by BOTH the edge function that records
 * a stage and the component that draws it. They cannot drift, because there is
 * only one list.
 *
 * If an operation is not in here with a real, recorded key set, no waiting
 * screen may name it: a panel with an operation it cannot measure prints a
 * percentage that means nothing.
 *
 * The client imports this file directly (relative path from src/lib); Deno
 * functions import it as "../_shared/stageKeys.ts".
 */

export const OPERATION_STAGES = {
  /** mirror-read: open the profile, read the posts, find the evidence, write. */
  linkedin_read: ["open", "posts", "evidence", "write"],
  /** cv-crosscheck: read the CV, then compare it against the profile. */
  cv_crosscheck: ["extract", "compare"],
  /** brand-assessment / generate-market-mirror: gather evidence, then write. */
  market_read: ["gather", "write"],
  /** ingest-capture: fetch the source, then read what is in it. */
  capture_ingest: ["fetch", "read"],
  /** generate-authority-content: gather the evidence, then write the draft. */
  studio_generate: ["gather", "write"],
  /** generate-deck (slides): plan the deck, then render it. */
  studio_slides: ["plan", "render"],
  /** generate-deck (export): render the pages, then build the file. */
  studio_export: ["render", "file"],
} as const;

export type InstrumentedOperation = keyof typeof OPERATION_STAGES;

export const INSTRUMENTED_OPERATIONS = Object.keys(OPERATION_STAGES) as InstrumentedOperation[];

/** The words a member reads for each stage. Plain English, no jargon. */
export const STAGE_LABELS: Record<InstrumentedOperation, Record<string, string>> = {
  linkedin_read: {
    open: "Opening your LinkedIn",
    posts: "Reading your posts",
    evidence: "Finding what only you have",
    write: "Writing your read",
  },
  cv_crosscheck: { extract: "Reading your CV", compare: "Comparing it with your profile" },
  market_read: { gather: "Gathering what Aura knows about you", write: "Writing your read" },
  capture_ingest: { fetch: "Fetching the source", read: "Reading what is in it" },
  studio_generate: { gather: "Gathering your evidence", write: "Writing the draft" },
  studio_slides: { plan: "Planning the slides", render: "Drawing them" },
  studio_export: { render: "Rendering the pages", file: "Building the file" },
};

export const stagesOf = (op: InstrumentedOperation): readonly string[] => OPERATION_STAGES[op];

export const labelOf = (op: InstrumentedOperation, key: string): string =>
  STAGE_LABELS[op]?.[key] ?? key;
