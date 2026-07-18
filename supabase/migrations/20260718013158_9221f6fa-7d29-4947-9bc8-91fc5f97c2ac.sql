
-- diagnostic_profiles: rescope to authenticated
DROP POLICY IF EXISTS "Users can view own profile" ON public.diagnostic_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.diagnostic_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.diagnostic_profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.diagnostic_profiles;

CREATE POLICY "Users can view own profile" ON public.diagnostic_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.diagnostic_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.diagnostic_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own profile" ON public.diagnostic_profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- linkedin_connections: add missing SELECT policy scoped to authenticated
CREATE POLICY "Users can view own linkedin connection" ON public.linkedin_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- storage.objects (documents bucket): rescope to authenticated
DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

CREATE POLICY "Users can view own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1]);
