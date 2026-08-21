import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

/**
 * COMPOSER PROVENANCE — the human route's half of "nothing is created without
 * its lineage".
 *
 * `generate-authority-content` hands back a `provenance` object: who made the
 * words, what produced them, which prompt and model, and every contribution
 * that went in. The generator knows the material; only the composer knows the
 * row id. These two helpers close that gap:
 *
 *   provenanceFields()  → the columns to spread into the insert
 *   recordLineage()     → the contributions, written against the new row id
 *
 * Recording lineage must never cost a draft: `recordLineage` swallows every
 * failure and logs it.
 */

export interface ComposerContribution {
  kind: "signal" | "capture" | "evidence_fragment" | "document" | "trend" | "voice_profile";
  id: string | null;
  role: "topic" | "evidence" | "number" | "background" | "timing" | "voice";
  note?: string | null;
}

export interface ComposerProvenance {
  made_by?: string | null;
  produced_by?: string | null;
  prompt_version?: string | null;
  model_used?: string | null;
  contributions?: ComposerContribution[];
}

/** The `provenance` object off a generation response, or null if absent. */
export function readProvenance(json: any): ComposerProvenance | null {
  const p = json?.provenance;
  if (!p || typeof p !== "object") return null;
  return p as ComposerProvenance;
}

/**
 * The provenance columns for a composer-created row. A draft written in the
 * composer arrived by being generated in place, and was produced by the
 * composer — those two are true of this path regardless of what came back.
 */
export function provenanceFields(p: ComposerProvenance | null): Record<string, string> {
  const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: Record<string, string> = {
    made_by: clean(p?.made_by) || "aura",
    produced_by: "composer",
    arrived_by: "generated_in_place",
  };
  const prompt = clean(p?.prompt_version);
  const model = clean(p?.model_used);
  if (prompt) out.prompt_version = prompt;
  if (model) out.model_used = model;
  return out;
}

/**
 * Write what went into one row. Fire-and-forget by design: the caller has
 * already saved the member's words, and a lineage failure is logged, never
 * surfaced.
 */
export async function recordLineage(
  contentTable: "linkedin_posts" | "content_items",
  contentId: string | null | undefined,
  contributions: ComposerContribution[] | undefined | null,
): Promise<void> {
  if (!contentId || !contributions || contributions.length === 0) return;
  try {
    const { error } = await invokeEdgeFunction("record-lineage", {
      body: { content_table: contentTable, content_id: contentId, contributions },
    });
    if (error) console.error("[lineage] not recorded (non-blocking):", error.message);
  } catch (e) {
    console.error("[lineage] not recorded (non-blocking):", (e as Error)?.message);
  }
}
