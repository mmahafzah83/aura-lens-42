
CREATE TABLE IF NOT EXISTS public.oe_write_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  audience_fit boolean NOT NULL,
  has_viewpoint boolean NOT NULL,
  adds_something boolean NOT NULL,
  suits_positioning boolean NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('keep','discard')),
  reason text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id)
);

GRANT SELECT ON public.oe_write_value TO authenticated;
GRANT ALL ON public.oe_write_value TO service_role;
ALTER TABLE public.oe_write_value ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own writing assessments" ON public.oe_write_value
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_oe_write_value_updated BEFORE UPDATE ON public.oe_write_value
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.oe_assess_writing_value(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_sectors text[]; v_allowed text[]; v_n integer;
BEGIN
  SELECT sectors_core, countries_allowed INTO v_sectors, v_allowed FROM oe_eligibility WHERE user_id=p_user;
  v_sectors := COALESCE(v_sectors,'{}'::text[]); v_allowed := COALESCE(v_allowed,'{}'::text[]);

  WITH base AS (
    SELECT o.id, o.title, o.scope, o.sector, o.location, o.chair_type, o.evidence_quote, o.quote_verified,
           COALESCE(m.eligibility_fail,'{}'::text[]) fails,
           lower(concat_ws(' ', o.title, o.scope, o.sector)) txt,
           public.oe_place_country(o.location) country
      FROM oe_opportunities o
      JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=p_user ORDER BY x.judged_at DESC NULLS LAST LIMIT 1) m ON true
     WHERE o.alive
  ), checks AS (
    SELECT b.*,
      -- 1. does the subject fit his audience: his sectors, or the market he writes for
      (EXISTS (SELECT 1 FROM unnest(v_sectors) s WHERE b.txt LIKE '%'||replace(s,'_','%')||'%')
       OR b.txt ~ '(water|utilit|energy|government|public sector|logistic|transport|digital|infrastructure)'
       OR COALESCE(b.country,'') = ANY (v_allowed)
       OR COALESCE(b.country,'') IN ('AE','QA','KW','BH','OM')) AS audience_fit,
      -- 2. has he a viewpoint or experience of his own on it
      EXISTS (SELECT 1 FROM oe_faces f WHERE f.user_id=p_user AND NULLIF(trim(f.summary),'') IS NOT NULL
               AND b.txt ~ '(transform|digital|governance|operating model|strategy|strategic|infrastructure|data|\mai\M|programme|program|portfolio|policy|regulat|water|utilit|logistic)') AS has_viewpoint,
      -- 3. is there something useful to add: a verified quote carrying a concrete fact
      (b.quote_verified IS TRUE AND NULLIF(trim(b.evidence_quote),'') IS NOT NULL
        AND (b.evidence_quote ~ '[0-9]' OR length(b.evidence_quote) > 120)) AS adds_something,
      -- 4. is it appropriate to his positioning
      (COALESCE(b.chair_type,'') <> 'role'
        OR b.txt ~ '(director|head of|chief|managing|partner|principal|board|general manager|vice president)') AS suits_positioning
    FROM base b
  ), verdicts AS (
    SELECT c.*,
      CASE
        WHEN ('place' = ANY(c.fails) OR 'nationality_mismatch' = ANY(c.fails))
             AND NOT (c.audience_fit AND c.adds_something) THEN 'discard'
        WHEN NOT (c.audience_fit OR c.has_viewpoint OR c.adds_something OR c.suits_positioning) THEN 'discard'
        ELSE 'keep' END AS verdict
    FROM checks c
  )
  INSERT INTO oe_write_value AS w (user_id,opportunity_id,audience_fit,has_viewpoint,adds_something,suits_positioning,verdict,reason,assessed_at)
  SELECT p_user, v.id, v.audience_fit, v.has_viewpoint, v.adds_something, v.suits_positioning, v.verdict,
    CASE WHEN v.verdict='discard' AND ('place' = ANY(v.fails) OR 'nationality_mismatch' = ANY(v.fails))
           THEN 'Ruled out on country or nationality, and the subject itself is not worth writing about'
         WHEN v.verdict='discard' THEN 'Fails all four writing checks'
         ELSE 'Passes at least one writing check' END, now()
  FROM verdicts v
  ON CONFLICT (user_id,opportunity_id) DO UPDATE
    SET audience_fit=EXCLUDED.audience_fit, has_viewpoint=EXCLUDED.has_viewpoint,
        adds_something=EXCLUDED.adds_something, suits_positioning=EXCLUDED.suits_positioning,
        verdict=EXCLUDED.verdict, reason=EXCLUDED.reason, assessed_at=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.oe_assess_writing_value(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_assess_writing_value(uuid) TO service_role;
