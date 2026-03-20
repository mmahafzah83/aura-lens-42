
-- Add pinned and image_url columns to entries
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS image_url text;

-- Create storage bucket for capture images
INSERT INTO storage.buckets (id, name, public) VALUES ('capture-images', 'capture-images', true) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to capture-images
CREATE POLICY "Users can upload capture images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'capture-images');

-- Allow public read access
CREATE POLICY "Public read capture images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'capture-images');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own capture images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'capture-images' AND (storage.foldername(name))[1] = auth.uid()::text);
