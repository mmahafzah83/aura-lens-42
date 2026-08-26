CREATE UNIQUE INDEX IF NOT EXISTS uq_acm_summary_session
  ON public.aura_conversation_memory (user_id, session_id)
  WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS idx_acm_summary_recent
  ON public.aura_conversation_memory (user_id, created_at DESC)
  WHERE role IS NULL;