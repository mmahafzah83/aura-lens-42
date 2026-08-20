/**
 * The client's door onto the ONE stage-key definition. The list itself lives in
 * `supabase/functions/_shared/stageKeys.ts` because the edge functions must be
 * able to import it too — this file only re-exports it so components have a
 * tidy `@/lib/operationStages` import.
 *
 * If a key changes, it changes in one file and both sides move together.
 */
export {
  OPERATION_STAGES,
  STAGE_LABELS,
  INSTRUMENTED_OPERATIONS,
  stagesOf,
  labelOf,
  type InstrumentedOperation,
} from "../../supabase/functions/_shared/stageKeys";

import { OPERATION_STAGES, STAGE_LABELS, type InstrumentedOperation } from "../../supabase/functions/_shared/stageKeys";
import type { WorkingStage, StageState } from "@/components/ui/WorkingPanel";

/**
 * Build the step list for an instrumented operation from a record of what has
 * ACTUALLY completed. A finished step stays finished — including in the failure
 * state, which is the whole point of keeping a record rather than reading a
 * single "current stage" variable.
 */
export function buildStages(
  operation: InstrumentedOperation,
  opts: {
    completed: string[];
    active?: string | null;
    failed?: string | null;
    labels?: Partial<Record<string, string>>;
  },
): WorkingStage[] {
  const done = new Set(opts.completed);
  return OPERATION_STAGES[operation].map((key): WorkingStage => ({
    key,
    label: opts.labels?.[key] ?? STAGE_LABELS[operation][key] ?? key,
    state: (done.has(key)
      ? "done"
      : opts.failed === key
        ? "failed"
        : opts.active === key
          ? "active"
          : "waiting") as StageState,
  }));
}
