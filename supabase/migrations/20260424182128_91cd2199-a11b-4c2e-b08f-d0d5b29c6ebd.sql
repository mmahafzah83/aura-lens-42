
-- 1. Realtime: restrict channel subscriptions to authenticated users on their own user-scoped topics
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users subscribe to own topics" ON realtime.messages;
CREATE POLICY "Authenticated users subscribe to own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = auth.uid()::text
  OR realtime.topic() LIKE auth.uid()::text || ':%'
  OR realtime.topic() LIKE 'public:%'
);

-- 2. captures bucket — add owner-scoped UPDATE and DELETE policies
DROP POLICY IF EXISTS "Users can update own captures files" ON storage.objects;
CREATE POLICY "Users can update own captures files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'captures' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'captures' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own captures files" ON storage.objects;
CREATE POLICY "Users can delete own captures files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'captures' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. capture-images bucket — add owner-scoped UPDATE policy
DROP POLICY IF EXISTS "Users can update own capture-images files" ON storage.objects;
CREATE POLICY "Users can update own capture-images files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'capture-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'capture-images' AND (storage.foldername(name))[1] = auth.uid()::text);
