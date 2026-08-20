ALTER TABLE public.operation_runs
  ADD COLUMN IF NOT EXISTS stages jsonb NOT NULL DEFAULT '[]'::jsonb;