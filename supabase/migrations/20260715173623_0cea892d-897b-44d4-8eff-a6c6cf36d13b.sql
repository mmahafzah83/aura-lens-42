CREATE TABLE public.onboarding_article_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  sector_focus text,
  core_practice text,
  outcome text NOT NULL,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.onboarding_article_log TO authenticated;
GRANT ALL ON public.onboarding_article_log TO service_role;

ALTER TABLE public.onboarding_article_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read onboarding article log"
ON public.onboarding_article_log
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

CREATE INDEX idx_onboarding_article_log_created_at ON public.onboarding_article_log (created_at DESC);