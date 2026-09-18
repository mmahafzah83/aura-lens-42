CREATE TABLE public.oe_vocabulary (
  key text PRIMARY KEY,
  en text NOT NULL,
  ar text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('chair','lane','label','action','state')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oe_vocabulary TO anon;
GRANT SELECT, INSERT, UPDATE ON public.oe_vocabulary TO authenticated;
GRANT ALL ON public.oe_vocabulary TO service_role;

ALTER TABLE public.oe_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone may read the vocabulary" ON public.oe_vocabulary
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins may add vocabulary" ON public.oe_vocabulary
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admins may change vocabulary" ON public.oe_vocabulary
  FOR UPDATE TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

CREATE TRIGGER oe_vocabulary_touch BEFORE UPDATE ON public.oe_vocabulary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.oe_vocabulary (key, en, ar, kind) VALUES
  ('lane_open', 'An open way in', 'مدخل مفتوح', 'lane'),
  ('lane_forming', 'Still forming', 'إشارة تتشكّل', 'lane'),
  ('why_you', 'Why this reached you', 'لماذا وصلتك', 'label'),
  ('the_way_in', 'The way in', 'المدخل', 'label'),
  ('no_way_in', 'No way in yet', 'لا مدخل حتى الآن', 'label'),
  ('the_distance', 'What is missing', 'المسافة', 'label'),
  ('the_move', 'Your move now', 'حركتك الآن', 'label'),
  ('fits_you', 'Fits you', 'تناسبك', 'label'),
  ('your_chance', 'Your chance of reaching it', 'فرصتك في الوصول إليها', 'label'),
  ('not_known_yet', 'Not known yet', 'لا نعرف بعد', 'state'),
  ('nothing_today', 'Nothing with a way in today', 'لا شيء له مدخل اليوم', 'state'),
  ('source', 'Source', 'المصدر', 'label'),
  ('from_your_writing', 'From your own writing', 'من كتابتك أنت', 'label'),
  ('closes_in', 'Closes in', 'تُغلق بعد', 'label'),
  ('no_date', 'No date given', 'لا تاريخ محدد', 'label'),
  ('prepare', 'Prepare it for me', 'جهّزها لي', 'action'),
  ('prepare_post', 'Prepare the post', 'جهّز المنشور', 'action'),
  ('tap_right', 'That''s right', 'صحيح', 'action'),
  ('tap_not_quite', 'Not quite', 'ليس تماماً', 'action'),
  ('tap_not_mine', 'Not my area', 'ليس مجالي', 'action'),
  ('less_from_source', 'Less from this source', 'أقل من هذه الجهة', 'action'),
  ('noted', 'Noted', 'سجّلناها', 'state'),
  ('chair_board', 'Board seat', 'مقعد مجلس', 'chair'),
  ('chair_mandate', 'Mandate', 'تكليف', 'chair'),
  ('chair_role', 'Position', 'منصب', 'chair'),
  ('chair_room', 'Closed meeting', 'لقاء مغلق', 'chair'),
  ('chair_speaking', 'Stage', 'منصة', 'chair'),
  ('chair_media', 'Media', 'إعلام', 'chair'),
  ('chair_advisory', 'Advisory', 'استشارة', 'chair'),
  ('chair_award', 'Award', 'جائزة', 'chair'),
  ('chair_learning', 'Training', 'تدريب', 'chair'),
  ('fit_strong', 'Strong', 'قوية', 'state'),
  ('fit_worth_a_look', 'Worth a look', 'تستحق النظر', 'state'),
  ('fit_stretch', 'Far', 'بعيدة', 'state');

ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS route_url text,
  ADD COLUMN IF NOT EXISTS route_kind text;

ALTER TABLE public.oe_matches ADD COLUMN IF NOT EXISTS lane text;
ALTER TABLE public.oe_cards
  ADD COLUMN IF NOT EXISTS lane text,
  ADD COLUMN IF NOT EXISTS cited_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.oe_member_evidence(
  p_user_id uuid,
  p_embedding vector,
  p_k integer DEFAULT 8
)
RETURNS TABLE(kind text, id uuid, title text, body text, occurred_at timestamptz, distance double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pool AS (
    SELECT 'fragment'::text AS kind, f.id, f.title, f.content AS body,
           f.created_at AS occurred_at, (f.embedding <=> p_embedding) AS distance
    FROM public.evidence_fragments f
    WHERE f.user_id = p_user_id AND f.embedding IS NOT NULL
    UNION ALL
    SELECT 'entry'::text, e.id, e.title, e.content, e.created_at, (e.embedding <=> p_embedding)
    FROM public.entries e
    WHERE e.user_id = p_user_id AND e.embedding IS NOT NULL
    UNION ALL
    SELECT 'post'::text, p.id, NULL::text, p.post_text, p.published_at, (p.embedding <=> p_embedding)
    FROM public.linkedin_posts p
    WHERE p.user_id = p_user_id AND p.embedding IS NOT NULL AND p.published_at IS NOT NULL
  )
  SELECT kind, id, title, body, occurred_at, distance
  FROM pool
  ORDER BY distance ASC
  LIMIT greatest(1, coalesce(p_k, 8));
$$;

REVOKE ALL ON FUNCTION public.oe_member_evidence(uuid, vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_member_evidence(uuid, vector, integer) TO service_role;