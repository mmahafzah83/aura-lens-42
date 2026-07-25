CREATE OR REPLACE FUNCTION public.report_invariants()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with started as (
    select
      user_id,
      (select count(*) from jsonb_object_keys(coalesce(brand_assessment_answers::jsonb, '{}'::jsonb))) as answer_keys,
      brand_assessment_results,
      brand_assessment_completed_at
    from public.diagnostic_profiles
  ),
  norm as (
    select
      user_id,
      answer_keys,
      brand_assessment_completed_at,
      case
        when brand_assessment_results is null then -1
        when jsonb_typeof(brand_assessment_results::jsonb) <> 'object' then -1
        else (select count(*) from jsonb_object_keys(brand_assessment_results::jsonb))::int
      end as result_keys
    from started
  ),
  answers_no_results as (
    select user_id from norm where answer_keys > 0 and result_keys <= 0
  ),
  empty_results as (
    -- results present as an object but empty, for someone who actually started
    select user_id from norm
    where result_keys = 0
      and (answer_keys > 0 or brand_assessment_completed_at is not null)
  ),
  completed_no_results as (
    select user_id from norm
    where brand_assessment_completed_at is not null and result_keys <= 0
  )
  select jsonb_build_object(
    'checked_at', now(),
    'answers_without_results', jsonb_build_object(
      'count', (select count(*) from answers_no_results),
      'samples', coalesce((select jsonb_agg(user_id) from (select user_id from answers_no_results limit 50) s), '[]'::jsonb)
    ),
    'empty_results_object', jsonb_build_object(
      'count', (select count(*) from empty_results),
      'samples', coalesce((select jsonb_agg(user_id) from (select user_id from empty_results limit 50) s), '[]'::jsonb)
    ),
    'completed_without_results', jsonb_build_object(
      'count', (select count(*) from completed_no_results),
      'samples', coalesce((select jsonb_agg(user_id) from (select user_id from completed_no_results limit 50) s), '[]'::jsonb)
    )
  );
$function$;