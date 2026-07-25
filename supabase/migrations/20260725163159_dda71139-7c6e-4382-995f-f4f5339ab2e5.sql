CREATE OR REPLACE FUNCTION public.report_invariants()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with
  answers_no_results as (
    select user_id from public.diagnostic_profiles
    where brand_assessment_answers is not null
      and jsonb_typeof(brand_assessment_answers::jsonb) = 'object'
      and (select count(*) from jsonb_object_keys(brand_assessment_answers::jsonb)) > 0
      and (
        brand_assessment_results is null
        or jsonb_typeof(brand_assessment_results::jsonb) <> 'object'
        or (select count(*) from jsonb_object_keys(brand_assessment_results::jsonb)) = 0
      )
  ),
  empty_results as (
    select user_id from public.diagnostic_profiles
    where brand_assessment_results is not null
      and jsonb_typeof(brand_assessment_results::jsonb) = 'object'
      and (select count(*) from jsonb_object_keys(brand_assessment_results::jsonb)) = 0
  ),
  completed_no_results as (
    select user_id from public.diagnostic_profiles
    where brand_assessment_completed_at is not null
      and (
        brand_assessment_results is null
        or jsonb_typeof(brand_assessment_results::jsonb) <> 'object'
        or (select count(*) from jsonb_object_keys(brand_assessment_results::jsonb)) = 0
      )
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