
-- 1) Restrict LinkedIn connection token columns to service role only.
-- Remove client SELECT access to base table; clients must use the safe view.
DROP POLICY IF EXISTS "Users can view own linkedin connection" ON public.linkedin_connections;
REVOKE SELECT ON public.linkedin_connections FROM anon, authenticated;
GRANT SELECT ON public.linkedin_connections_safe TO anon, authenticated;

-- 2) Lock down qa_reports writes to admin only (no public write paths).
CREATE POLICY "Admin can insert qa_reports"
ON public.qa_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid);

CREATE POLICY "Admin can update qa_reports"
ON public.qa_reports FOR UPDATE TO authenticated
USING (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid)
WITH CHECK (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid);

CREATE POLICY "Admin can delete qa_reports"
ON public.qa_reports FOR DELETE TO authenticated
USING (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid);

-- 3) Tighten Realtime channel SELECT policy: remove public:* wildcard,
--    keep only per-user topic patterns.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can subscribe to own user topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  (realtime.topic() = (auth.uid())::text)
  OR (realtime.topic() LIKE ((auth.uid())::text || ':%'))
);
