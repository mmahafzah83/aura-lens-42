ALTER TABLE public.agent_findings
  ADD COLUMN IF NOT EXISTS themes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dropped_themes text[] NOT NULL DEFAULT '{}';