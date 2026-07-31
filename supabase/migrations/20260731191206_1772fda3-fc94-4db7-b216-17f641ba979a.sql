CREATE TABLE public.whatsapp_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 text UNIQUE,
  pair_token text UNIQUE,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  bound_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.whatsapp_links TO authenticated;
GRANT ALL ON public.whatsapp_links TO service_role;

ALTER TABLE public.whatsapp_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own whatsapp link"
ON public.whatsapp_links FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own whatsapp link"
ON public.whatsapp_links FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_whatsapp_links_updated_at
BEFORE UPDATE ON public.whatsapp_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_phone text,
  body text,
  kind text,
  entry_id uuid,
  result text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own whatsapp messages"
ON public.whatsapp_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages (created_at DESC);

CREATE OR REPLACE FUNCTION public.whatsapp_mint_pair_token()
RETURNS TABLE(pair_token text, token_expires_at timestamptz, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.whatsapp_links%ROWTYPE;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text := '';
  v_bytes bytea;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_existing FROM public.whatsapp_links WHERE user_id = v_uid;

  IF FOUND AND v_existing.status = 'active' THEN
    RETURN QUERY SELECT NULL::text, v_existing.token_expires_at, v_existing.status;
    RETURN;
  END IF;

  v_bytes := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v_token := v_token || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  END LOOP;

  INSERT INTO public.whatsapp_links (user_id, pair_token, token_expires_at, status)
  VALUES (v_uid, v_token, now() + interval '15 minutes', 'pending')
  ON CONFLICT (user_id) DO UPDATE
    SET pair_token = EXCLUDED.pair_token,
        token_expires_at = EXCLUDED.token_expires_at,
        status = 'pending';

  RETURN QUERY SELECT v_token, (now() + interval '15 minutes')::timestamptz, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_mint_pair_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_mint_pair_token() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_links;