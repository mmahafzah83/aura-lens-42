
CREATE TABLE public.linkedin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  linkedin_id text,
  display_name text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamp with time zone,
  scopes text[] DEFAULT '{}'::text[],
  connected_at timestamp with time zone DEFAULT now(),
  last_synced_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own linkedin connection"
  ON public.linkedin_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own linkedin connection"
  ON public.linkedin_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own linkedin connection"
  ON public.linkedin_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own linkedin connection"
  ON public.linkedin_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX linkedin_connections_user_id_idx ON public.linkedin_connections(user_id);
