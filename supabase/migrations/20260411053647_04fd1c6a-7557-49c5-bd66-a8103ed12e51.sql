-- Fix: Add WITH CHECK clause to linkedin_connections UPDATE policy
ALTER POLICY "Users can update own linkedin connection"
ON public.linkedin_connections
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);