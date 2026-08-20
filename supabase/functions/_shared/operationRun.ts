/**
 * OPERATION RUNS — one row per expensive operation, written at the start and
 * updated at the end.
 *
 * A run that never finishes keeps a null `finished_at`. That is deliberate:
 * a stuck operation must be visible, and duration is always
 * `finished_at - started_at` so no stored number can drift.
 *
 * Recording must never fail the thing it records. Every write here is
 * swallowed and logged to the console.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

export type OperationName =
  | "linkedin_read"
  | "cv_crosscheck"
  | "market_read"
  | "capture_ingest"
  | "studio_generate"
  | "studio_slides"
  | "studio_export"
  | "article_ingest";


export type Outcome = "ok" | "refused" | "failed";

export interface RunStart {
  operation: OperationName;
  attempt?: number;
  user_id?: string | null;
  anon_token?: string | null;
  fingerprint_hash?: string | null;
  meta?: Record<string, unknown>;
}

export interface RunEnd {
  outcome: Outcome;
  reason_code?: string | null;
  cost_usd?: number | null;
  meta?: Record<string, unknown>;
}

/** A handle that finishes exactly one run, at most once. */
export interface RunHandle {
  id: string | null;
  /**
   * Close the stage that was running and open this one. The last open stage
   * is closed by `finish`. Stage durations are what the waiting screens weight
   * their percentage by, so they are measured here and nowhere else.
   */
  mark: (stageKey: string) => void;
  finish: (end: RunEnd) => Promise<void>;
}


function adminClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function startRun(
  client: SupabaseClient | undefined,
  start: RunStart,
): Promise<RunHandle> {
  let id: string | null = null;
  const admin = adminClient(client);
  try {
    const { data, error } = await admin
      .from("operation_runs")
      .insert({
        operation: start.operation,
        started_at: new Date().toISOString(),
        attempt: start.attempt ?? 1,
        user_id: start.user_id ?? null,
        anon_token: start.anon_token ?? null,
        fingerprint_hash: start.fingerprint_hash ?? null,
        meta: start.meta ?? {},
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    id = (data as { id?: string } | null)?.id ?? null;
  } catch (e) {
    console.error("[operation_runs] start failed (non-blocking):", (e as Error)?.message ?? e);
  }

  let done = false;
  const stages: { key: string; ms: number }[] = [];
  let openKey: string | null = null;
  let openAt = Date.now();
  const closeOpen = () => {
    if (openKey === null) return;
    stages.push({ key: openKey, ms: Math.max(1, Date.now() - openAt) });
    openKey = null;
  };

  return {
    get id() { return id; },
    mark(stageKey: string) {
      closeOpen();
      openKey = stageKey;
      openAt = Date.now();
    },
    async finish(end: RunEnd) {
      if (done || !id) return;
      done = true;
      closeOpen();
      try {
        const patch: Record<string, unknown> = {
          finished_at: new Date().toISOString(),
          outcome: end.outcome,
          reason_code: end.outcome === "ok" ? null : (end.reason_code ?? null),
          stages,
        };
        if (end.cost_usd !== undefined) patch.cost_usd = end.cost_usd;
        if (end.meta) patch.meta = end.meta;
        const { error } = await admin.from("operation_runs").update(patch).eq("id", id);
        if (error) throw error;
      } catch (e) {
        console.error("[operation_runs] finish failed (non-blocking):", (e as Error)?.message ?? e);
      }

    },
  } as RunHandle;
}
