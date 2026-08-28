/**
 * COUNTS — the server mirror of `src/lib/counts.ts`.
 *
 * U1 — the library page and the Desk gave two different capture figures because
 * each wrote its own query. One definition now, expressed identically on both
 * sides:
 *
 *   user_captures  = entries where source_type is null or <> 'aura_agent'
 *   agent_captures = entries where source_type = 'aura_agent'
 *   total          = every entries row for the member
 *
 * `documents` rows are NOT captures and are never added in. If this file and
 * its client twin ever disagree, the member sees two numbers again — change
 * both or neither.
 */

export interface CaptureCounts {
  user_captures: number;
  agent_captures: number;
  total: number;
}

export const EMPTY_CAPTURE_COUNTS: CaptureCounts = {
  user_captures: 0,
  agent_captures: 0,
  total: 0,
};

export function isAgentCapture(row: { source_type?: string | null } | null | undefined): boolean {
  return (row?.source_type ?? null) === "aura_agent";
}

/** Reads the two exact counts with a service-role client. Never throws. */
export async function fetchCaptureCounts(admin: any, userId: string): Promise<CaptureCounts> {
  try {
    const [totalRes, agentRes] = await Promise.all([
      admin.from("entries").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source_type", "aura_agent"),
    ]);
    const total = Number(totalRes?.count ?? 0);
    const agent_captures = Number(agentRes?.count ?? 0);
    return { total, agent_captures, user_captures: Math.max(0, total - agent_captures) };
  } catch {
    return { ...EMPTY_CAPTURE_COUNTS };
  }
}

/** Documents, deduped by filename exactly as the library list dedupes them. */
export async function fetchDocumentCount(admin: any, userId: string): Promise<number> {
  try {
    const { data } = await admin.from("documents").select("id, filename").eq("user_id", userId);
    const seen = new Set<string>();
    for (const d of (data || []) as any[]) seen.add(d.filename ?? `__id__:${d.id}`);
    return seen.size;
  } catch {
    return 0;
  }
}
