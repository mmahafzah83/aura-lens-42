-- Retire recommended_moves: rename table (preserves rows and history), resolve open health finding.
ALTER TABLE IF EXISTS public.recommended_moves RENAME TO recommended_moves_retired_20260718;

UPDATE public.health_findings
   SET resolved_at = now()
 WHERE code = 'freshness.recommended_moves'
   AND resolved_at IS NULL;