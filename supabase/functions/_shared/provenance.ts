/**
 * One vocabulary for where a piece of content came from, and one place to
 * write what went into it.
 *
 * The rule this file exists to enforce: nothing is created without its
 * lineage. A draft that cannot say which signal, which evidence and which
 * voice produced it is a draft nobody can defend later.
 */

export type MadeBy = "member" | "aura" | "aura_edited_by_member" | "machine" | "unknown";
export type ArrivedBy =
  | "published_through_aura"
  | "imported_by_member"
  | "discovered_by_search"
  | "entered_by_member"
  | "generated_in_place"
  | "unknown";
export type Confidence = "confirmed" | "reported" | "guessed" | "unknown";
export type ProducedBy = "composer" | "weekly_drafts" | "overnight_agent" | "carousel_studio";

export type ContributorKind =
  | "signal" | "capture" | "evidence_fragment" | "document" | "trend" | "voice_profile";
export type LineageRole = "topic" | "evidence" | "number" | "background" | "timing" | "voice";

/** Bumped whenever the drafting prompt changes in a way that changes output. */
export const PROMPT_VERSION = "2026-08-20.a";

export interface Contribution {
  kind: ContributorKind;
  id: string | null;
  role: LineageRole;
  note?: string | null;
}

/**
 * What the generator drew on, carried back to whoever writes the row.
 * The generator knows the material; only the caller knows the row id.
 */
export interface GenerationProvenance {
  made_by: MadeBy;
  produced_by: ProducedBy | null;
  prompt_version: string;
  model_used: string | null;
  contributions: Contribution[];
}

/**
 * Write lineage for one created row. Duplicate contributions are ignored,
 * so a retry cannot double-count. Recording never fails the creation.
 */
export async function writeLineage(
  admin: { from: (t: string) => any },
  contentTable: "linkedin_posts" | "content_items",
  contentId: string,
  contributions: Contribution[],
): Promise<number> {
  const seen = new Set<string>();
  const rows = contributions
    .filter((c) => c && c.kind && c.role)
    .filter((c) => {
      const key = `${c.kind}|${c.id ?? ""}|${c.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => ({
      content_table: contentTable,
      content_id: contentId,
      contributor_kind: c.kind,
      contributor_id: c.id,
      role: c.role,
      note: c.note ?? null,
    }));
  if (rows.length === 0) return 0;
  try {
    const { error } = await admin
      .from("content_lineage")
      .upsert(rows, {
        onConflict: "content_table,content_id,contributor_kind,contributor_id,role",
        ignoreDuplicates: true,
      });
    if (error) throw error;
    return rows.length;
  } catch (e) {
    console.error("[content_lineage] write failed (non-blocking):", (e as Error)?.message ?? e);
    return 0;
  }
}
