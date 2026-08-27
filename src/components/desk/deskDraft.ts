import { supabase } from "@/integrations/supabase/client";

/**
 * deskDraft — the only way the Desk is allowed to touch his library.
 *
 * HARD RULES, held here rather than in a prompt:
 *  1. INSERT only. There is no update path in this file, so the Desk can
 *     never overwrite a word he has typed.
 *  2. `tracking_status` is always "draft". There is no publish path here.
 *  3. Every insert returns an id, and `undoDeskDraft` removes it — one
 *     visible Undo, and the library is exactly as it was.
 */

export const GAP_MARK = "___";

export interface DeskDraftSeed {
  /** What the Desk could source, in his own counts. */
  opening: string;
  /** The one line only he can write. Must contain GAP_MARK. */
  gapLine: string;
  subject: string;
  /** Said plainly in the Desk's own message, and again on arrival. */
  missing: string;
}

const HANDOVER_KEY = (id: string) => `aura.desk.handover.${id}`;

export interface Handover { missing: string; at: number }

export function readHandover(draftId: string): Handover | null {
  try {
    const raw = localStorage.getItem(HANDOVER_KEY(draftId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Handover;
    return v && typeof v.missing === "string" ? v : null;
  } catch { return null; }
}

/** Dismissed permanently, for this draft only. */
export function dismissHandover(draftId: string) {
  try { localStorage.removeItem(HANDOVER_KEY(draftId)); } catch { /* nothing to clear */ }
}

function writeHandover(draftId: string, missing: string) {
  try { localStorage.setItem(HANDOVER_KEY(draftId), JSON.stringify({ missing, at: Date.now() })); } catch { /* the banner simply will not show */ }
}

/** Creates a draft and records the handover. Returns the new row id. */
export async function createDeskDraft(seed: DeskDraftSeed): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return null;
  if (!seed.gapLine.includes(GAP_MARK)) return null;

  const body = `${seed.opening}\n\n${seed.gapLine}`;
  const { data, error } = await supabase
    .from("linkedin_posts")
    .insert({
      user_id: uid,
      post_text: body,
      format_type: "post",
      /* Never anything else. The Desk cannot publish. */
      tracking_status: "draft",
      source_type: "aura_generated",
      authorship: "aura_drafted",
      title: seed.subject.slice(0, 80),
      topic_label: seed.subject.slice(0, 80),
    } as any)
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    console.error("[desk] draft insert failed", error?.message);
    return null;
  }
  const id = String((data as any).id);
  writeHandover(id, seed.missing);
  return id;
}

/** One visible Undo. Removes only a row the Desk itself made, still a draft. */
export async function undoDeskDraft(draftId: string): Promise<boolean> {
  const { error } = await supabase
    .from("linkedin_posts")
    .delete()
    .eq("id", draftId)
    .eq("tracking_status", "draft")
    .eq("authorship", "aura_drafted");
  dismissHandover(draftId);
  if (error) { console.error("[desk] undo failed", error.message); return false; }
  return true;
}
