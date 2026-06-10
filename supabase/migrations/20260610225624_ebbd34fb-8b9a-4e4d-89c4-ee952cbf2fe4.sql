
-- Sanctioned one-time backfill. Runtime writes remain ingest-source-event only.

-- 1) entries -> capture / voice_note
INSERT INTO public.source_events (user_id, event_type, source_table, source_id, occurred_at, payload, processed_at)
SELECT
  e.user_id,
  CASE WHEN e.type = 'voice' THEN 'voice_note' ELSE 'capture' END,
  'entries',
  e.id,
  e.created_at,
  jsonb_build_object('capture_type', e.type, 'backfilled', true),
  NULL
FROM public.entries e
WHERE e.user_id IS NOT NULL
ON CONFLICT (user_id, source_table, source_id, event_type) DO NOTHING;

-- 2) documents (completed) -> document
INSERT INTO public.source_events (user_id, event_type, source_table, source_id, occurred_at, payload, processed_at)
SELECT
  d.user_id,
  'document',
  'documents',
  d.id,
  d.created_at,
  jsonb_build_object('page_count', d.page_count, 'backfilled', true),
  NULL
FROM public.documents d
WHERE d.status = 'completed' AND d.user_id IS NOT NULL
ON CONFLICT (user_id, source_table, source_id, event_type) DO NOTHING;

-- 3) linkedin_posts -> post (canonical PUBLISHED pairs only)
INSERT INTO public.source_events (user_id, event_type, source_table, source_id, occurred_at, payload, processed_at)
SELECT
  p.user_id,
  'post',
  'linkedin_posts',
  p.id,
  COALESCE(p.published_at, p.created_at),
  jsonb_build_object('source_type', p.source_type, 'tracking_status', p.tracking_status, 'backfilled', true),
  NULL
FROM public.linkedin_posts p
WHERE p.user_id IS NOT NULL
  AND (
    (p.source_type = 'aura_generated'  AND p.tracking_status = 'published') OR
    (p.source_type = 'linkedin_export' AND p.tracking_status = 'tracked') OR
    (p.source_type = 'browser_capture' AND p.tracking_status IN ('confirmed','metrics_imported')) OR
    (p.source_type = 'search_discovery' AND p.tracking_status = 'confirmed') OR
    (p.source_type = 'manual_url'      AND p.tracking_status = 'manual')
  )
ON CONFLICT (user_id, source_table, source_id, event_type) DO NOTHING;

-- 4) diagnostic_profiles (brand assessment completed) -> assessment
INSERT INTO public.source_events (user_id, event_type, source_table, source_id, occurred_at, payload, processed_at)
SELECT
  dp.user_id,
  'assessment',
  'diagnostic_profiles',
  dp.id,
  dp.brand_assessment_completed_at,
  jsonb_build_object('backfilled', true),
  NULL
FROM public.diagnostic_profiles dp
WHERE dp.brand_assessment_completed_at IS NOT NULL AND dp.user_id IS NOT NULL
ON CONFLICT (user_id, source_table, source_id, event_type) DO NOTHING;
