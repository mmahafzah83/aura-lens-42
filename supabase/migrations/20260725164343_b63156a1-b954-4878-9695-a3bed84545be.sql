CREATE TABLE public.report_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  version integer NOT NULL,
  data jsonb NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.report_snapshots TO authenticated;
GRANT ALL ON public.report_snapshots TO service_role;

CREATE UNIQUE INDEX report_snapshots_one_current_per_user
  ON public.report_snapshots (user_id) WHERE is_current;
CREATE INDEX report_snapshots_user_version_idx
  ON public.report_snapshots (user_id, version DESC);
CREATE UNIQUE INDEX report_snapshots_user_version_uniq
  ON public.report_snapshots (user_id, version);

ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report snapshots"
  ON public.report_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all report snapshots"
  ON public.report_snapshots FOR SELECT TO authenticated
  USING (public.is_current_user_admin());