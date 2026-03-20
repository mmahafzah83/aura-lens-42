
-- Master frameworks table for storing extracted expert systems
CREATE TABLE public.master_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_id uuid REFERENCES public.entries(id) ON DELETE SET NULL,
  title text NOT NULL,
  source_type text NOT NULL DEFAULT 'capture',
  framework_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.master_frameworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own frameworks" ON public.master_frameworks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own frameworks" ON public.master_frameworks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own frameworks" ON public.master_frameworks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own frameworks" ON public.master_frameworks FOR DELETE USING (auth.uid() = user_id);

-- Add framework_tag to entries for tagging expert captures
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS framework_tag text;
