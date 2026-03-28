CREATE OR REPLACE VIEW public.influence_dashboard_view AS
SELECT
  p.id,
  p.user_id,
  p.linkedin_post_id,
  p.post_url,
  p.post_text,
  p.hook,
  p.title,
  p.theme,
  p.tone,
  p.format_type,
  p.content_type,
  p.topic_label,
  p.media_type,
  p.tracking_status,
  p.source_type,
  p.published_at,
  p.like_count,
  p.comment_count,
  p.repost_count,
  p.engagement_score,
  p.created_at,
  COALESCE(m.impressions, 0) AS impressions,
  COALESCE(m.reactions, p.like_count) AS reactions,
  COALESCE(m.comments, p.comment_count) AS comments,
  COALESCE(m.shares, p.repost_count) AS shares,
  COALESCE(m.saves, 0) AS saves,
  COALESCE(m.engagement_rate, p.engagement_score) AS engagement_rate,
  m.snapshot_date AS metrics_date,
  m.source_type AS metrics_source_type
FROM public.linkedin_posts p
LEFT JOIN LATERAL (
  SELECT * FROM public.linkedin_post_metrics lpm
  WHERE lpm.post_id = p.id
  ORDER BY lpm.snapshot_date DESC
  LIMIT 1
) m ON true
WHERE p.tracking_status != 'rejected';