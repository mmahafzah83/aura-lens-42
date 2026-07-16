DROP VIEW IF EXISTS public.influence_timeline;
CREATE VIEW public.influence_timeline
WITH (security_invoker = on) AS
SELECT DISTINCT ON (user_id, snapshot_date)
  user_id,
  snapshot_date,
  followers,
  follower_growth,
  engagement_rate,
  impressions,
  reactions,
  comments,
  shares,
  members_reached,
  source_type
FROM public.influence_snapshots
ORDER BY
  user_id,
  snapshot_date,
  CASE source_type
    WHEN 'linkedin_api' THEN 1
    WHEN 'manual' THEN 2
    WHEN 'csv_import' THEN 3
    WHEN 'linkedin_export' THEN 4
    WHEN 'sync' THEN 5
    ELSE 6
  END,
  created_at DESC;

GRANT SELECT ON public.influence_timeline TO authenticated;
GRANT SELECT ON public.influence_timeline TO service_role;