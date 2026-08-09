/**
 * The single source of truth for post fingerprint labels.
 *
 * `hookStyleOf` and `endingTypeOf` are defined once in `generationMeta.ts` and
 * re-exported here so the live generation path and the one-off backfill read
 * exactly the same classifier — a historical row must be labelled the way a new
 * draft would be, or the variation engine learns from a different vocabulary.
 */
export {
  hookStyleOf,
  endingTypeOf,
  HOOK_VOCAB,
  ENDING_VOCAB,
} from "./generationMeta.ts";
export type { HookStyle, EndingType } from "./generationMeta.ts";
