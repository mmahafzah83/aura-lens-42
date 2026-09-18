-- ───────────────────────── WARMTH ─────────────────────────
CREATE TABLE public.oe_warmth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('wrote_about_it','worked_with_issuer','captured_it','none')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  strength numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id, kind)
);
GRANT SELECT ON public.oe_warmth TO authenticated;
GRANT ALL ON public.oe_warmth TO service_role;
ALTER TABLE public.oe_warmth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oe_warmth owner read" ON public.oe_warmth
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "oe_warmth admin read" ON public.oe_warmth
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE INDEX oe_warmth_user_opp_idx ON public.oe_warmth (user_id, opportunity_id);

-- ───────────────────────── PREPARED MOVES ─────────────────────────
CREATE TABLE public.oe_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  lane text,
  kind text NOT NULL CHECK (kind IN ('application_pack','positioning_post')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  linkedin_post_id uuid REFERENCES public.linkedin_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_moves TO authenticated;
GRANT ALL ON public.oe_moves TO service_role;
ALTER TABLE public.oe_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oe_moves owner read" ON public.oe_moves
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "oe_moves admin read" ON public.oe_moves
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE INDEX oe_moves_user_opp_idx ON public.oe_moves (user_id, opportunity_id);

-- ───────────────────────── THE CHECKLIST, THE DEAD ROUTE ─────────────────────────
ALTER TABLE public.oe_matches
  ADD COLUMN requirement_check jsonb,
  ADD COLUMN met_count integer,
  ADD COLUMN total_count integer;

ALTER TABLE public.oe_opportunities
  ADD COLUMN route_dead boolean NOT NULL DEFAULT false;

-- The prepared move is a new producer of drafts.
ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_produced_by_check;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_produced_by_check
  CHECK (produced_by IS NULL OR produced_by = ANY (ARRAY[
    'composer','weekly_drafts','overnight_agent','carousel_studio','oe-prepare-move'
  ]));

-- ───────────────────────── WARMTH, READ FROM WHAT WE HOLD ─────────────────────────
CREATE OR REPLACE FUNCTION public.oe_warmth_signals(
  p_user_id uuid,
  p_embedding vector,
  p_issuer_names text[] DEFAULT '{}'::text[]
)
RETURNS TABLE(kind text, item_kind text, id uuid, occurred_at timestamptz,
              similarity double precision, engagement numeric, snippet text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'wrote_about_it'::text, 'post'::text, p.id, p.published_at,
         (1 - (p.embedding <=> p_embedding))::double precision,
         (coalesce(p.like_count,0) + coalesce(p.comment_count,0))::numeric,
         left(coalesce(p.post_text,''), 200)
  FROM public.linkedin_posts p
  WHERE p.user_id = p_user_id AND p.embedding IS NOT NULL AND p.published_at IS NOT NULL
    AND (1 - (p.embedding <=> p_embedding)) >= 0.75
  UNION ALL
  SELECT 'captured_it', 'entry', e.id, e.created_at,
         (1 - (e.embedding <=> p_embedding))::double precision, 0::numeric,
         left(coalesce(e.title, e.content, ''), 200)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.embedding IS NOT NULL
    AND e.created_at > now() - interval '90 days'
    AND (1 - (e.embedding <=> p_embedding)) >= 0.78
  UNION ALL
  SELECT 'captured_it', 'fragment', f.id, f.created_at,
         (1 - (f.embedding <=> p_embedding))::double precision, 0::numeric,
         left(coalesce(f.title, f.content, ''), 200)
  FROM public.evidence_fragments f
  WHERE f.user_id = p_user_id AND f.embedding IS NOT NULL
    AND f.created_at > now() - interval '90 days'
    AND (1 - (f.embedding <=> p_embedding)) >= 0.78
  UNION ALL
  SELECT DISTINCT ON (e.id) 'worked_with_issuer', 'entry', e.id, e.created_at,
         1::double precision, 0::numeric, left(coalesce(e.title, e.content, ''), 200)
  FROM public.entries e, unnest(p_issuer_names) AS n
  WHERE e.user_id = p_user_id AND length(btrim(n)) >= 4
    AND (e.content ILIKE '%' || btrim(n) || '%' OR coalesce(e.title,'') ILIKE '%' || btrim(n) || '%')
  UNION ALL
  SELECT DISTINCT ON (f.id) 'worked_with_issuer', 'fragment', f.id, f.created_at,
         1::double precision, 0::numeric, left(coalesce(f.title, f.content, ''), 200)
  FROM public.evidence_fragments f, unnest(p_issuer_names) AS n
  WHERE f.user_id = p_user_id AND length(btrim(n)) >= 4
    AND (f.content ILIKE '%' || btrim(n) || '%' OR coalesce(f.title,'') ILIKE '%' || btrim(n) || '%')
  UNION ALL
  SELECT DISTINCT ON (p.id) 'worked_with_issuer', 'post', p.id, p.published_at,
         1::double precision,
         (coalesce(p.like_count,0) + coalesce(p.comment_count,0))::numeric,
         left(coalesce(p.post_text,''), 200)
  FROM public.linkedin_posts p, unnest(p_issuer_names) AS n
  WHERE p.user_id = p_user_id AND length(btrim(n)) >= 4
    AND coalesce(p.post_text,'') ILIKE '%' || btrim(n) || '%'
$function$;

REVOKE ALL ON FUNCTION public.oe_warmth_signals(uuid, vector, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_warmth_signals(uuid, vector, text[]) TO service_role;