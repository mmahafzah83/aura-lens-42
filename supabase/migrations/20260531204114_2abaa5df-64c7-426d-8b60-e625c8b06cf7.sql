-- Backup current lifecycle-relevant state
CREATE TABLE IF NOT EXISTS public.strategic_signals_lifecycle_backup_20260531 AS
SELECT id, user_id, status, confidence, fragment_count, now() AS backed_up_at
FROM public.strategic_signals;

-- Additive columns (nullable, no behaviour-changing defaults)
ALTER TABLE public.strategic_signals ADD COLUMN IF NOT EXISTS base_confidence numeric;
ALTER TABLE public.strategic_signals ADD COLUMN IF NOT EXISTS momentum numeric;
ALTER TABLE public.strategic_signals ADD COLUMN IF NOT EXISTS last_evidence_at timestamptz;
ALTER TABLE public.strategic_signals ADD COLUMN IF NOT EXISTS lifecycle_tier text;

-- Backfill base_confidence: preserved true quality (low-floor reconstruction)
UPDATE public.strategic_signals
SET base_confidence = LEAST(0.95, GREATEST(confidence, fragment_count * 0.045));

-- Backfill last_evidence_at: newest supporting fragment per signal
UPDATE public.strategic_signals s
SET last_evidence_at = sub.max_created
FROM (
  SELECT x.id, MAX(f.created_at) AS max_created
  FROM public.strategic_signals x
  LEFT JOIN public.evidence_fragments f ON f.id = ANY(x.supporting_evidence_ids)
  GROUP BY x.id
) sub
WHERE sub.id = s.id;

-- momentum and lifecycle_tier intentionally left NULL (computed later by lifecycle engine).