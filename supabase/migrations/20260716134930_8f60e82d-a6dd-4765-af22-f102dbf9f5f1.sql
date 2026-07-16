
CREATE TABLE IF NOT EXISTS public.lifecycle_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_key)
);

GRANT SELECT ON public.lifecycle_email_log TO authenticated;
GRANT ALL ON public.lifecycle_email_log TO service_role;

ALTER TABLE public.lifecycle_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read lifecycle email log"
ON public.lifecycle_email_log
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());

ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_opt_out boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_user
  ON public.lifecycle_email_log(user_id, message_key);
