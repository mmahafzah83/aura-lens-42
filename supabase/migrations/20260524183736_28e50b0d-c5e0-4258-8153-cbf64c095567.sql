CREATE POLICY "Users can view their own lifecycle emails"
ON public.lifecycle_emails
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own post metrics"
ON public.linkedin_post_metrics
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);