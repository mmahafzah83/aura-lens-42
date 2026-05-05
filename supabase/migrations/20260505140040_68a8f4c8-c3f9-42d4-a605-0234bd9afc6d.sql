CREATE TABLE IF NOT EXISTS public.market_mirror_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  headhunter_text text,
  client_cio_text text,
  curator_text text,
  gaps jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.market_mirror_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own mirror"
  ON public.market_mirror_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own mirror"
  ON public.market_mirror_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own mirror"
  ON public.market_mirror_cache FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own mirror"
  ON public.market_mirror_cache FOR DELETE
  USING (auth.uid() = user_id);