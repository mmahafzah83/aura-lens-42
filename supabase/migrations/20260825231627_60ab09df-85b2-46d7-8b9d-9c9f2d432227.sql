CREATE TABLE public.member_issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL CHECK (kind IN ('crash','feedback')),
  message text NOT NULL,
  route text,
  component_stack text,
  user_agent text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.member_issue_reports TO service_role;

ALTER TABLE public.member_issue_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read member issue reports"
ON public.member_issue_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX member_issue_reports_created_idx ON public.member_issue_reports (created_at DESC);