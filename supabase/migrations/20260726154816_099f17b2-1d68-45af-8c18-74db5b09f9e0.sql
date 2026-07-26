-- ONE DEFINITION of the economics figures. Both /admin and /admin/cost read
-- these; neither recomputes them, so they cannot disagree.

CREATE OR REPLACE FUNCTION public.admin_spend_by_function(p_months_back integer DEFAULT 0)
RETURNS TABLE(function_name text, spend numeric, calls integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(u.function_name, 'unknown')::text,
         round(coalesce(sum(u.est_cost_usd), 0)::numeric, 4),
         count(*)::integer
  FROM public.ai_usage_log u
  WHERE public.is_current_user_admin()
    AND u.created_at >= date_trunc('month', now()) - make_interval(months => greatest(p_months_back, 0))
    AND u.created_at <  date_trunc('month', now()) - make_interval(months => greatest(p_months_back, 0)) + interval '1 month'
  GROUP BY 1
  ORDER BY 2 DESC
$$;

CREATE OR REPLACE FUNCTION public.admin_spend_daily(p_days integer DEFAULT 30)
RETURNS TABLE(day date, spend numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d::date,
         round(coalesce((
           SELECT sum(u.est_cost_usd) FROM public.ai_usage_log u
           WHERE u.created_at >= d AND u.created_at < d + interval '1 day'
         ), 0)::numeric, 4)
  FROM generate_series(
         date_trunc('day', now()) - make_interval(days => greatest(p_days, 1) - 1),
         date_trunc('day', now()),
         interval '1 day') AS d
  WHERE public.is_current_user_admin()
  ORDER BY 1
$$;

-- Denominators for per-unit ratios. Founder and test accounts excluded, the
-- same exclusion the daily brief applies to every user number.
CREATE OR REPLACE FUNCTION public.admin_economics_denominators()
RETURNS TABLE(active_users integer, published_posts integer, signals_delivered integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH real_users AS (
    SELECT u.id FROM auth.users u
    WHERE u.id <> '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
      AND coalesce(u.email, '') NOT ILIKE '%test%'
      AND coalesce(u.email, '') NOT ILIKE '%@example.com'
  )
  SELECT
    (SELECT count(DISTINCT l.user_id)::integer FROM public.ai_usage_log l
      WHERE l.created_at >= date_trunc('month', now()) AND l.user_id IS NOT NULL),
    (SELECT count(*)::integer FROM public.linkedin_posts p
      WHERE p.tracking_status = 'published'
        AND p.created_at >= date_trunc('month', now())
        AND p.user_id IN (SELECT id FROM real_users)),
    (SELECT count(*)::integer FROM public.strategic_signals s
      WHERE s.created_at >= date_trunc('month', now())
        AND s.user_id IN (SELECT id FROM real_users))
  WHERE public.is_current_user_admin()
$$;

REVOKE EXECUTE ON FUNCTION public.admin_spend_by_function(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_spend_daily(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_economics_denominators() FROM anon;