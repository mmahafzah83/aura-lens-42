DROP FUNCTION public.oe_card_public(text);

CREATE FUNCTION public.oe_card_public(p_token text)
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
  opportunity_id text,
  quote text,
  source_url text
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
    o.id::text,
    c.quote,
    o.source_url
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