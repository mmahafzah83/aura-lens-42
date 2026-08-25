ALTER TABLE public.voice_rules
  ADD COLUMN IF NOT EXISTS "check" jsonb,
  ADD COLUMN IF NOT EXISTS last_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS times_applied integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voice_rules_check_shape'
  ) THEN
    ALTER TABLE public.voice_rules
      ADD CONSTRAINT voice_rules_check_shape
      CHECK (
        "check" IS NULL OR (
          jsonb_typeof("check") = 'object'
          AND "check"->>'kind' IN ('phrase', 'opening', 'ending', 'marker')
          AND length(btrim(COALESCE("check"->>'value', ''))) > 0
        )
      );
  END IF;
END $$;