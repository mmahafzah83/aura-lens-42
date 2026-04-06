
-- Add user_signal_feedback column to strategic_signals if not exists
ALTER TABLE public.strategic_signals ADD COLUMN IF NOT EXISTS user_signal_feedback text;

-- Create signal_topic_preferences table
CREATE TABLE IF NOT EXISTS public.signal_topic_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_tag text NOT NULL,
  preference_score float DEFAULT 0.0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, theme_tag)
);

-- Enable RLS
ALTER TABLE public.signal_topic_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can select own preferences" ON public.signal_topic_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.signal_topic_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.signal_topic_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
