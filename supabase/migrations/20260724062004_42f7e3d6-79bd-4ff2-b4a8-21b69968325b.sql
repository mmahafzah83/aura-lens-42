-- CHANGE 2: One-time backfill scoped to linkedin_export only
UPDATE public.linkedin_posts
SET authorship = 'user_written'
WHERE source_type = 'linkedin_export'
  AND (authorship IS NULL OR authorship = 'unset');

-- CHANGE 3: Restructure publish_invariants() so count is unlimited; samples cap at 50.
CREATE OR REPLACE FUNCTION public.publish_invariants()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  unclassified_all as (
    select id from linkedin_posts
    where published_at is not null
      and (authorship is null or authorship not in ('aura_drafted','aura_assisted','user_written','unknown'))
  ),
  stuck_all as (
    select id from linkedin_posts
    where tracking_status = 'publishing'
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
  ),
  twins_all as (
    select ci.id from content_items ci
    where ci.status = 'draft'
      and exists (
        select 1 from linkedin_posts lp
        where lp.user_id = ci.user_id
          and lp.published_at is not null
          and lp.post_text = ci.body
      )
  ),
  stale_review_all as (
    select id from linkedin_posts
    where tracking_status = 'needs_review'
      and coalesce(claimed_at, created_at) < now() - interval '7 days'
  )
  select jsonb_build_object(
    'checked_at', now(),
    'unclassified', jsonb_build_object(
      'count', (select count(*) from unclassified_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from unclassified_all limit 50) s), '[]'::jsonb)
    ),
    'stuck_publishing', jsonb_build_object(
      'count', (select count(*) from stuck_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from stuck_all limit 50) s), '[]'::jsonb)
    ),
    'published_draft_twins', jsonb_build_object(
      'count', (select count(*) from twins_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from twins_all limit 50) s), '[]'::jsonb)
    ),
    'stale_needs_review', jsonb_build_object(
      'count', (select count(*) from stale_review_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from stale_review_all limit 50) s), '[]'::jsonb)
    )
  );
$function$;