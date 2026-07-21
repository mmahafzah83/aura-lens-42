CREATE POLICY "Users can update their own agent findings"
ON public.agent_findings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);