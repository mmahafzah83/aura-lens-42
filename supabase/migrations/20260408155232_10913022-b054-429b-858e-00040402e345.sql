-- Create captures storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('captures', 'captures', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own captures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'captures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to view their own captures
CREATE POLICY "Users can view own captures"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'captures' AND auth.uid()::text = (storage.foldername(name))[1]);