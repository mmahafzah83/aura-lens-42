
-- STEP 40 — one shape on the card, three layers in the match.

ALTER TABLE public.oe_matches ADD COLUMN IF NOT EXISTS interest jsonb;
COMMENT ON COLUMN public.oe_matches.interest IS 'Ranking signal only: overlap with what the member reads and wants. Never proof, never a gate.';

-- ── A) the card serves one shape; everything else is still judged and stored ──
CREATE OR REPLACE FUNCTION public.oe_card_kinds()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT array_agg(x) FROM oe_policy_versions p, jsonb_array_elements_text(p.params->'card_kinds') x WHERE p.active),
    ARRAY['executive_role']::text[]);
$$;
REVOKE EXECUTE ON FUNCTION public.oe_card_kinds() FROM anon;

-- ── F) supply and demand, one row ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.oe_member_metrics
WITH (security_invoker = on) AS
SELECT
  u.user_id,
  (SELECT count(*) FROM oe_entities) AS organisations_watched,
  (SELECT count(*) FROM oe_surfaces s WHERE s.last_harvested_at >= now() - interval '7 days') AS surfaces_read_week,
  (SELECT count(*) FROM oe_matches m WHERE m.user_id = u.user_id) AS records_judged,
  (SELECT count(*) FROM oe_matches m WHERE m.user_id = u.user_id AND m.screen_outcome = 'survivor') AS survivors,
  (SELECT count(*) FROM oe_serves s WHERE s.user_id = u.user_id AND s.card_id IS NOT NULL) AS cards_served,
  COALESCE((SELECT jsonb_object_agg(t.tap, t.n) FROM (
      SELECT s.tap, count(*) n FROM oe_serves s
       WHERE s.user_id = u.user_id AND s.tap IS NOT NULL GROUP BY s.tap) t), '{}'::jsonb) AS taps_by_kind,
  COALESCE((SELECT jsonb_object_agg(o.outcome, o.n) FROM (
      SELECT s.outcome, count(*) n FROM oe_serves s
       WHERE s.user_id = u.user_id AND s.outcome IS NOT NULL GROUP BY s.outcome) o), '{}'::jsonb) AS outcomes,
  (SELECT min(s.tapped_at) FROM oe_serves s
    WHERE s.user_id = u.user_id AND s.tap = 'right' AND s.card_id IS NOT NULL
      AND COALESCE(s.channel,'app') <> 'test') AS activated_at
FROM (SELECT DISTINCT user_id FROM oe_matches WHERE user_id IS NOT NULL) u;

GRANT SELECT ON public.oe_member_metrics TO authenticated;
