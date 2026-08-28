import { supabase } from "@/integrations/supabase/client";

/**
 * What the Desk has learned about working with him — read, and forget.
 *
 * Only five kinds exist, and each row is a count with its evidence behind it.
 * Nothing here is a personality reading: a system that learns invisibly and
 * cannot be corrected is the thing members are right to distrust, so every row
 * is visible and every row can be forgotten for good.
 */

export type LearningKind = "asks_about" | "acts_on" | "rejects" | "talks_like" | "corrects";

export interface LearningRow {
  id: string;
  kind: LearningKind;
  observation: string;
  evidence_count: number;
  confidence: "observed" | "strong";
  first_seen: string;
  last_seen: string;
}

/** Plain words for each kind. No jargon reaches the member. */
export const KIND_LABEL: Record<LearningKind, string> = {
  asks_about: "What you ask for",
  acts_on: "What you act on",
  rejects: "What you turn down",
  talks_like: "How you write to me",
  corrects: "Where you corrected me",
};

export async function loadLearning(): Promise<LearningRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return [];
  const { data, error } = await supabase
    .from("desk_learning")
    .select("id, kind, observation, evidence_count, confidence, first_seen, last_seen")
    .eq("dismissed", false)
    .order("evidence_count", { ascending: false });
  if (error) { console.error("[desk] learning read failed", error.message); return []; }
  return (data || []) as LearningRow[];
}

/** Forget this one. A dismissed observation is never learned again. */
export async function forgetOne(id: string): Promise<boolean> {
  const { error } = await supabase.from("desk_learning").update({ dismissed: true }).eq("id", id);
  if (error) { console.error("[desk] forget failed", error.message); return false; }
  return true;
}

/** Forget everything. Same rule: none of it comes back. */
export async function forgetAll(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const { error } = await supabase.from("desk_learning").update({ dismissed: true }).in("id", ids);
  if (error) { console.error("[desk] forget all failed", error.message); return false; }
  return true;
}
