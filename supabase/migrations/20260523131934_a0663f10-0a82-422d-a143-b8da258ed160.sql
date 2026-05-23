
-- authority_scores: add UPDATE and DELETE policies
CREATE POLICY "Users can update their own authority scores"
  ON public.authority_scores FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own authority scores"
  ON public.authority_scores FOR DELETE
  USING (auth.uid() = user_id);

-- score_snapshots: add UPDATE policy
CREATE POLICY "Users can update their own score snapshots"
  ON public.score_snapshots FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_milestones: add INSERT/UPDATE/DELETE policies
CREATE POLICY "Users can insert their own milestones"
  ON public.user_milestones FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own milestones"
  ON public.user_milestones FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own milestones"
  ON public.user_milestones FOR DELETE
  USING (auth.uid() = user_id);

-- weekly_missions: add INSERT and DELETE policies
CREATE POLICY "Users can insert their own weekly missions"
  ON public.weekly_missions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own weekly missions"
  ON public.weekly_missions FOR DELETE
  USING (auth.uid() = user_id);

-- lifecycle_emails: add INSERT/UPDATE/DELETE policies (scoped to owner)
CREATE POLICY "Users can insert their own lifecycle emails"
  ON public.lifecycle_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lifecycle emails"
  ON public.lifecycle_emails FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lifecycle emails"
  ON public.lifecycle_emails FOR DELETE
  USING (auth.uid() = user_id);

-- linkedin_connections: revoke read access to OAuth token columns from client roles.
-- Server-side edge functions use the service role and remain unaffected.
REVOKE SELECT (access_token, refresh_token) ON public.linkedin_connections FROM anon, authenticated;

-- Set fixed search_path on SECURITY DEFINER functions we own
ALTER FUNCTION public.rollback_design_version(integer) SET search_path = public;
ALTER FUNCTION public.activate_design_version(jsonb, uuid) SET search_path = public;
