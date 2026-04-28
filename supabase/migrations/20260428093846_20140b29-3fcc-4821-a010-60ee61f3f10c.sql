ALTER TABLE public.aura_conversation_memory
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_acm_user_created
  ON public.aura_conversation_memory (user_id, created_at DESC);