ALTER TABLE diagnostic_profiles
  ADD COLUMN IF NOT EXISTS phone_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
    "email_weekly_brief": true,
    "email_signal_shifts": true,
    "inapp_all": true,
    "whatsapp_timing_windows": false,
    "whatsapp_silence_alarm": false,
    "push_enabled": false
  }'::jsonb;

CREATE TABLE IF NOT EXISTS aura_conversation_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary TEXT,
  key_decisions TEXT[],
  topics_discussed TEXT[],
  actions_committed TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE aura_conversation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own memory" ON aura_conversation_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_acm_user_date ON aura_conversation_memory(user_id, session_date DESC);

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('timing_window','silence_alarm','signal_shift','weekly_brief','knowledge_debt')),
  channel TEXT NOT NULL CHECK (channel IN ('inapp','email','whatsapp','push')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  acted_on BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notification_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ne_user_unread ON notification_events(user_id, read, sent_at DESC);