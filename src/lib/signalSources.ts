/**
 * THE SOURCES BEHIND ONE SIGNAL — one computation, client and server agreeing.
 *
 * THE RULE this file exists to honour: when a number sits next to a control
 * that reveals a list, the number MUST be the length of the list that will be
 * revealed. So every surface that reveals the sources behind a signal reveals
 * THESE rows, and states THIS length.
 *
 * The dedupe key is byte-for-byte the reconciler's rule. `reconcile_signal_counts()`
 * computes:
 *
 *   SELECT COUNT(DISTINCT COALESCE(sr.source_id::text, sr.id::text))
 *   FROM evidence_fragments f
 *   JOIN source_registry sr ON sr.id = f.source_registry_id
 *   WHERE f.id = ANY(supporting_evidence_ids)
 *
 * Three consequences we copy exactly:
 *   1. key = `source_id` when present, else the registry row's `id`;
 *   2. the JOIN is INNER — a fragment with no readable registry row is NOT a
 *      source and is dropped (it used to be kept here, which is precisely why
 *      the two computations could disagree);
 *   3. no truncation — every supporting id is read, chunked so a long `.in()`
 *      list stays inside a safe URL length.
 *
 * So `rows.length` should always equal `strategic_signals.unique_orgs`. If it
 * ever does not, that is real data drift and the caller should shout.
 */
import { supabase } from "@/integrations/supabase/client";

/** One source behind a signal, ready to render. */
export interface SignalSourceRow {
  /** Stable per source (the dedupe key), so React keys never collide. */
  id: string;
  title: string;
  /** Newest evidence date seen for this source. */
  created_at: string;
  kind: "capture" | "aura" | "unknown";
}

/** Ids per request — keeps a long `.in()` list inside a safe URL length. */
const CHUNK = 150;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Every distinct source behind one signal, newest evidence first.
 * Never throws: on failure it returns an empty list.
 */
export async function loadSignalSources(
  supportingEvidenceIds: readonly (string | null | undefined)[] | null | undefined,
  fallbackTitle = "Untitled source",
): Promise<SignalSourceRow[]> {
  const ids = (supportingEvidenceIds || []).filter(Boolean).map(String);
  if (!ids.length) return [];

  try {
    const fs: any[] = [];
    for (const part of chunk(ids, CHUNK)) {
      const { data } = await supabase
        .from("evidence_fragments")
        .select("id, title, created_at, source_registry_id")
        .in("id", part)
        .order("created_at", { ascending: false });
      fs.push(...((data || []) as any[]));
    }
    fs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const regIds = Array.from(new Set(fs.map((f) => f.source_registry_id).filter(Boolean)));
    if (!regIds.length) return [];

    const regMap = new Map<string, any>();
    for (const part of chunk(regIds as string[], CHUNK)) {
      const sr = await supabase
        .from("source_registry" as any)
        .select("id, source_type, source_id, title")
        .in("id", part);
      (sr.data || []).forEach((r: any) => regMap.set(String(r.id), r));
    }

    const entryIds = Array.from(new Set(
      Array.from(regMap.values())
        .filter((r: any) => r.source_type === "entry" && r.source_id)
        .map((r: any) => String(r.source_id)),
    ));
    const entryMap = new Map<string, any>();
    for (const part of chunk(entryIds, CHUNK)) {
      const ents = await supabase.from("entries").select("id, title, type, account_name").in("id", part);
      (ents.data || []).forEach((e: any) => entryMap.set(String(e.id), e));
    }

    const seen = new Set<string>();
    const out: SignalSourceRow[] = [];
    for (const f of fs) {
      const reg = f.source_registry_id ? regMap.get(String(f.source_registry_id)) : null;
      // INNER JOIN, same as the reconciler: no registry row, not a source.
      if (!reg) continue;
      // COALESCE(sr.source_id, sr.id) — the reconciler's key, exactly.
      const key = reg.source_id ? String(reg.source_id) : String(reg.id);
      if (seen.has(key)) continue;
      seen.add(key);

      let kind: SignalSourceRow["kind"] = "unknown";
      let title = reg.title || f.title || fallbackTitle;
      if (reg.source_type === "entry" && reg.source_id) {
        const ent = entryMap.get(String(reg.source_id));
        if (ent) {
          const isAura = (ent.account_name || "").toLowerCase().includes("aura")
            || (ent.type || "").toLowerCase().includes("onboarding")
            || (ent.type || "").toLowerCase().includes("exa");
          kind = isAura ? "aura" : "capture";
          title = ent.title || reg.title || title;
        }
      } else if (reg.source_type === "document") {
        kind = "capture";
      }

      out.push({ id: key, title, created_at: f.created_at, kind });
    }
    return out;
  } catch (e) {
    console.warn("[loadSignalSources] failed", e);
    return [];
  }
}

/**
 * The invariant alarm. `rows.length` and `unique_orgs` are two computations of
 * the same rule; a difference is genuine data drift, never a display choice.
 */
export function warnIfDrifted(where: string, signalId: string | null, rows: number, uniqueOrgs: number): void {
  if (uniqueOrgs && rows !== uniqueOrgs) {
    console.warn(`[${where}] source count drift`, { signalId, readable: rows, unique_orgs: uniqueOrgs });
  }
}
