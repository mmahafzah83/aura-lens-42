import type { HomeMove } from "@/hooks/useHomeAddress";

export interface MoveText { title: string; what: string; why: string; how: string; outcome: string }

/** The member-facing words of a move in the interface language. English keeps today's fallbacks. */
export function moveText(move: HomeMove, lang: string): MoveText {
  if (lang === "ar" && move.ar) return { ...move.ar };
  return {
    title: move.title ?? move.what ?? "",
    what: move.what, why: move.why, how: move.how, outcome: move.outcome,
  };
}
