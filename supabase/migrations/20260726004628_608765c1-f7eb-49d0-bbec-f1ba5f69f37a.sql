WITH src AS (
  SELECT
    rs.id,
    dp.brand_assessment_results AS r,
    dp.first_name, dp.last_name, dp.level, dp.sector_focus
  FROM public.report_snapshots rs
  JOIN public.diagnostic_profiles dp ON dp.user_id = rs.user_id
  WHERE rs.is_current IS TRUE
    AND dp.brand_assessment_results IS NOT NULL
    AND (rs.data ? 'brand_paper') IS NOT TRUE
)
UPDATE public.report_snapshots rs
SET data = rs.data
  || jsonb_build_object('template_version', 'aura-paper-v2')
  || jsonb_build_object('brand_paper', jsonb_strip_nulls(jsonb_build_object(
       'primary_archetype',      src.r->>'primary_archetype',
       'secondary_archetype',    src.r->>'secondary_archetype',
       'positioning_statement',  src.r->>'positioning_statement',
       'market_read',            src.r->>'market_read',
       'trust_pattern',          src.r->>'trust_pattern',
       'natural_tone',           src.r->>'natural_tone',
       'unique_capability',      src.r->>'unique_capability',
       'uncontested_space',      src.r->>'uncontested_space',
       'honest_truth',           src.r->>'honest_truth',
       'zone_of_genius',         src.r->>'zone_of_genius',
       'voice_signature',        src.r->>'voice_signature',
       'authority_style',        src.r->>'authority_style',
       'key_barrier',            src.r->>'key_barrier'
     ))
     || jsonb_build_object(
       'topics',          COALESCE(src.r->'topics', '[]'::jsonb),
       'invest_next',     COALESCE(src.r->'invest_next', '[]'::jsonb),
       'content_pillars', COALESCE(src.r->'content_pillars', '[]'::jsonb),
       'growth_areas',    COALESCE(src.r->'growth_areas', '[]'::jsonb),
       'profile', jsonb_build_object(
         'first_name',   src.first_name,
         'last_name',    src.last_name,
         'level',        src.level,
         'sector_focus', src.sector_focus
       ),
       'generated_at', COALESCE(rs.data->>'generated_at', now()::text)
     ))
FROM src
WHERE src.id = rs.id;