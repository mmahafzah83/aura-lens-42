-- ── 1. WARMTH, CALIBRATED TO THE MEMBER'S OWN SPREAD ────────────────────────
-- A fixed 0.75 was never reachable with these vectors: against this record the
-- member's closest fragment scores 0.56 and his closest post 0.33, while his
-- whole library averages 0.17. Nearness is therefore read as distance from his
-- own mean, with a floor so a flat library cannot manufacture a signal.
CREATE OR REPLACE FUNCTION public.oe_warmth_signals(
  p_user_id uuid, p_embedding vector, p_issuer_names text[] DEFAULT '{}'::text[]
)
RETURNS TABLE(kind text, item_kind text, id uuid, occurred_at timestamptz,
              similarity double precision, engagement numeric, snippet text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH post_sims AS (
    SELECT p.id, p.published_at, (1 - (p.embedding <=> p_embedding)) AS sim,
           (coalesce(p.like_count,0) + coalesce(p.comment_count,0))::numeric AS eng,
           left(coalesce(p.post_text,''), 200) AS snip
    FROM public.linkedin_posts p
    WHERE p.user_id = p_user_id AND p.embedding IS NOT NULL AND p.published_at IS NOT NULL
  ),
  post_stat AS (SELECT avg(sim) m, coalesce(stddev_samp(sim), 0) s FROM post_sims)
  SELECT 'wrote_about_it'::text, 'post'::text, ps.id, ps.published_at,
         ps.sim::double precision, ps.eng, ps.snip
  FROM post_sims ps, post_stat st
  WHERE ps.sim >= greatest(st.m + 2 * st.s, 0.28)
  ORDER BY ps.sim DESC
  LIMIT 5
$function$;

CREATE OR REPLACE FUNCTION public.oe_warmth_signals_captures(
  p_user_id uuid, p_embedding vector
)
RETURNS TABLE(kind text, item_kind text, id uuid, occurred_at timestamptz,
              similarity double precision, engagement numeric, snippet text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cap_sims AS (
    SELECT 'entry'::text AS item_kind, e.id, e.created_at AS at,
           (1 - (e.embedding <=> p_embedding)) AS sim,
           left(coalesce(e.title, e.content, ''), 200) AS snip
    FROM public.entries e
    WHERE e.user_id = p_user_id AND e.embedding IS NOT NULL
      AND e.created_at > now() - interval '90 days'
    UNION ALL
    SELECT 'fragment', f.id, f.created_at,
           (1 - (f.embedding <=> p_embedding)),
           left(coalesce(f.title, f.content, ''), 200)
    FROM public.evidence_fragments f
    WHERE f.user_id = p_user_id AND f.embedding IS NOT NULL
      AND f.created_at > now() - interval '90 days'
  ),
  cap_stat AS (SELECT avg(sim) m, coalesce(stddev_samp(sim), 0) s FROM cap_sims)
  SELECT 'captured_it'::text, c.item_kind, c.id, c.at,
         c.sim::double precision, 0::numeric, c.snip
  FROM cap_sims c, cap_stat st
  WHERE c.sim >= greatest(st.m + 3 * st.s, 0.40)
  ORDER BY c.sim DESC
  LIMIT 5
$function$;

CREATE OR REPLACE FUNCTION public.oe_warmth_issuer_text(
  p_user_id uuid, p_issuer_names text[]
)
RETURNS TABLE(kind text, item_kind text, id uuid, occurred_at timestamptz,
              similarity double precision, engagement numeric, snippet text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (e.id) 'worked_with_issuer'::text, 'entry'::text, e.id, e.created_at,
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

-- ── 2. WHAT THE RECORD ASKS OF A PERSON, KEPT APART FROM THE DEAL ───────────
ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discovery_kind text NOT NULL DEFAULT 'posted_opening';

ALTER TABLE public.oe_opportunities DROP CONSTRAINT IF EXISTS oe_opportunities_discovery_kind_check;
ALTER TABLE public.oe_opportunities ADD CONSTRAINT oe_opportunities_discovery_kind_check
  CHECK (discovery_kind IN ('corporate_event_inference','term_ending','new_entity','departure','arabic_only_source','posted_opening'));

-- ── 3. THE ISSUER'S PUBLIC FACES ────────────────────────────────────────────
-- Public professional role information only. No email, no telephone, no
-- personal address — the table has nowhere to put them.
CREATE TABLE IF NOT EXISTS public.oe_issuer_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id uuid NOT NULL REFERENCES public.oe_issuers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role_title text,
  source_url text NOT NULL,
  is_public_spokesperson boolean NOT NULL DEFAULT false,
  linkedin_url text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer_id, full_name)
);

GRANT SELECT ON public.oe_issuer_people TO authenticated;
GRANT ALL ON public.oe_issuer_people TO service_role;
ALTER TABLE public.oe_issuer_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read issuer people" ON public.oe_issuer_people;
CREATE POLICY "Members can read issuer people" ON public.oe_issuer_people
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS oe_issuer_people_touch ON public.oe_issuer_people;
CREATE TRIGGER oe_issuer_people_touch BEFORE UPDATE ON public.oe_issuer_people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS oe_issuer_people_issuer_idx ON public.oe_issuer_people(issuer_id);

-- ── 4. LEAD TIME AS A MEASURED NUMBER, NEVER A BARE ONE ─────────────────────
CREATE OR REPLACE FUNCTION public.oe_expected_lead_days(
  p_discovery_kind text, p_chair_type text DEFAULT NULL
)
RETURNS TABLE(expected_lead_days integer, sample_size integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH pairs AS (
    SELECT lp.lead_days
    FROM public.oe_leadtime_pairs lp
    JOIN public.oe_opportunities o ON o.id = lp.opportunity_id
    WHERE lp.lead_days IS NOT NULL
      AND o.discovery_kind = p_discovery_kind
      AND (p_chair_type IS NULL OR lp.chair_type = p_chair_type)
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_days)::integer, count(*)::integer
  FROM pairs
  HAVING count(*) > 0
$function$;

GRANT EXECUTE ON FUNCTION public.oe_expected_lead_days(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oe_warmth_signals_captures(uuid, vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.oe_warmth_issuer_text(uuid, text[]) TO service_role;

-- ── 5. THE WORDS ON THE SCREEN ──────────────────────────────────────────────
INSERT INTO public.oe_vocabulary (key, en, ar, kind) VALUES
  ('hidden_find', 'You wouldn''t have found this', 'ما كنت لتجدها', 'label'),
  ('hidden_why', 'Why we saw it', 'كيف رأيناها', 'label'),
  ('no_requirements_published', 'This one does not publish what it asks for', 'هذه الجهة لا تنشر ما تطلبه', 'label'),
  ('expected_lead', 'Usually posted after', 'عادةً تُنشر بعد', 'label'),
  ('sample_of', 'from', 'من', 'label'),
  ('not_measured_yet', 'Not measured yet', 'لم نقسها بعد', 'label'),
  ('mentions', 'Who to name', 'من تذكر', 'label'),
  ('basis_quoted', 'you answer something they said publicly', 'تردّ على ما قالوه علناً', 'label'),
  ('basis_spokesperson', 'the named public voice for this announcement', 'المتحدث المعلن عن هذا الإعلان', 'label'),
  ('basis_known', 'someone you already know', 'شخص تعرفه بالفعل', 'label'),
  ('discovery_corporate_event_inference', 'A deal that implies an unposted mandate', 'صفقة تُنبئ بتكليف لم يُعلن', 'label'),
  ('discovery_term_ending', 'A board term running out', 'دورة مجلس تقترب من نهايتها', 'label'),
  ('discovery_new_entity', 'A new entity being formed', 'كيان جديد قيد التأسيس', 'label'),
  ('discovery_departure', 'A named executive leaving', 'تنفيذي معلَن يغادر منصبه', 'label'),
  ('discovery_arabic_only_source', 'Only an Arabic source carried it', 'لم تنقلها سوى مصادر عربية', 'label'),
  ('discovery_posted_opening', 'An ordinary published call', 'إعلان منشور عادي', 'label')
ON CONFLICT (key) DO UPDATE SET en = EXCLUDED.en, ar = EXCLUDED.ar, kind = EXCLUDED.kind;