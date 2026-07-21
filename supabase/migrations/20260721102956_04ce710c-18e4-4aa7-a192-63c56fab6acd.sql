create or replace function public.publish_invariants()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with
  unclassified as (
    select id from linkedin_posts
    where published_at is not null
      and (authorship is null or authorship not in ('aura_drafted','aura_assisted','user_written','unknown'))
    limit 50
  ),
  stuck as (
    select id from linkedin_posts
    where tracking_status = 'publishing'
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    limit 50
  ),
  twins as (
    select ci.id from content_items ci
    where ci.status = 'draft'
      and exists (
        select 1 from linkedin_posts lp
        where lp.user_id = ci.user_id
          and lp.published_at is not null
          and lp.post_text = ci.body
      )
    limit 50
  ),
  stale_review as (
    select id from linkedin_posts
    where tracking_status = 'needs_review'
      and coalesce(claimed_at, created_at) < now() - interval '7 days'
    limit 50
  )
  select jsonb_build_object(
    'checked_at', now(),
    'unclassified', jsonb_build_object('count',(select count(*) from unclassified),'samples',coalesce((select jsonb_agg(id) from unclassified),'[]'::jsonb)),
    'stuck_publishing', jsonb_build_object('count',(select count(*) from stuck),'samples',coalesce((select jsonb_agg(id) from stuck),'[]'::jsonb)),
    'published_draft_twins', jsonb_build_object('count',(select count(*) from twins),'samples',coalesce((select jsonb_agg(id) from twins),'[]'::jsonb)),
    'stale_needs_review', jsonb_build_object('count',(select count(*) from stale_review),'samples',coalesce((select jsonb_agg(id) from stale_review),'[]'::jsonb))
  );
$$;

revoke all on function public.publish_invariants() from public;
grant execute on function public.publish_invariants() to service_role;