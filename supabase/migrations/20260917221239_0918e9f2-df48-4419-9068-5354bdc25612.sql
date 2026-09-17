-- lovable-cron-fallback-reviewed: 48 runs/day; required so member feedback affects matching within 30 minutes.
ALTER TABLE public.oe_taps
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

ALTER TABLE public.oe_faces
  ADD COLUMN IF NOT EXISTS few_shot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.oe_outcomes
  DROP CONSTRAINT IF EXISTS oe_outcomes_stage_check;

ALTER TABLE public.oe_outcomes
  ADD CONSTRAINT oe_outcomes_stage_check
  CHECK (stage IN ('asked','applied','won','nothing','pursued','not_yet','no','shortlisted','declined','no_news'));

CREATE INDEX IF NOT EXISTS oe_taps_unapplied_idx
  ON public.oe_taps (tapped_at)
  WHERE applied_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS oe_outcomes_one_ask_per_card_idx
  ON public.oe_outcomes (card_id)
  WHERE stage = 'asked';

CREATE OR REPLACE FUNCTION public.oe_record_tap(
  p_token text,
  p_tap text,
  p_scope text DEFAULT NULL::text,
  p_scope_value text DEFAULT NULL::text,
  p_source text DEFAULT 'email'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.oe_cards%ROWTYPE;
  v_source text;
BEGIN
  IF p_tap IS NULL OR p_tap NOT IN ('right','not_quite','not_my_area','less_from_here') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tap');
  END IF;

  IF p_scope IS NOT NULL AND p_scope NOT IN ('issuer','level','place','type','just_this') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_scope');
  END IF;

  v_source := CASE WHEN p_source = 'app' THEN 'inapp' ELSE p_source END;
  IF v_source NOT IN ('email','whatsapp','inapp') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_source');
  END IF;

  SELECT * INTO v_card
  FROM public.oe_cards
  WHERE tap_token = p_token AND token_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired_or_unknown');
  END IF;

  INSERT INTO public.oe_taps (user_id, card_id, tap, scope, scope_value, source, applied_at)
  VALUES (v_card.user_id, v_card.id, p_tap, p_scope, p_scope_value, v_source, NULL)
  ON CONFLICT (card_id, tap) DO UPDATE
    SET scope = EXCLUDED.scope,
        scope_value = EXCLUDED.scope_value,
        source = EXCLUDED.source,
        tapped_at = now(),
        applied_at = NULL;

  UPDATE public.oe_cards
     SET opened_at = COALESCE(opened_at, now()),
         kit_offered = CASE WHEN p_tap = 'right' THEN true ELSE kit_offered END
   WHERE id = v_card.id;

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', v_card.id,
    'tap', p_tap,
    'next', CASE
      WHEN p_tap IN ('not_quite','not_my_area') AND p_scope IS NULL THEN 'which_part'
      ELSE 'thanks'
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.oe_record_tap(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_record_tap(text,text,text,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_card_public(p_token text)
RETURNS TABLE(
  card_id uuid,
  title text,
  chair_type text,
  time_kind text,
  language text,
  current_tap text,
  current_scope text,
  issuer_id text,
  seniority_band text,
  location text,
  opportunity_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    o.title,
    o.chair_type,
    o.time_kind,
    COALESCE(p.content_language, o.language, 'en'),
    t.tap,
    t.scope,
    o.issuer_id::text,
    o.seniority_band,
    o.location,
    o.id::text
  FROM public.oe_cards c
  LEFT JOIN public.oe_opportunities o ON o.id = c.opportunity_id
  LEFT JOIN public.diagnostic_profiles p ON p.user_id = c.user_id
  LEFT JOIN LATERAL (
    SELECT ot.tap, ot.scope
    FROM public.oe_taps ot
    WHERE ot.card_id = c.id
    ORDER BY ot.tapped_at DESC
    LIMIT 1
  ) t ON true
  WHERE c.tap_token = p_token
    AND c.token_expires_at > now()
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.oe_card_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_card_public(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_record_outcome(p_token text, p_outcome text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.oe_cards%ROWTYPE;
  v_outcome public.oe_outcomes%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('applied','won','nothing') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_outcome');
  END IF;

  SELECT * INTO v_card
  FROM public.oe_cards
  WHERE tap_token = p_token AND token_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired_or_unknown');
  END IF;

  SELECT * INTO v_outcome
  FROM public.oe_outcomes
  WHERE card_id = v_card.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.oe_outcomes
       SET stage = p_outcome,
           answered_at = now()
     WHERE id = v_outcome.id;
  ELSE
    INSERT INTO public.oe_outcomes (user_id, card_id, stage, answered_at)
    VALUES (v_card.user_id, v_card.id, p_outcome, now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'card_id', v_card.id, 'outcome', p_outcome);
END;
$function$;

REVOKE ALL ON FUNCTION public.oe_record_outcome(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_record_outcome(text,text) TO anon, authenticated, service_role;

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('oe-learn-taps-30min','oe-weekly-rules','oe-outcome-ask-daily');

SELECT cron.schedule(
  'oe-learn-taps-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-learn-taps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'oe-weekly-rules',
  '0 2 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-weekly-rules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'oe-outcome-ask-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-outcome-ask',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);