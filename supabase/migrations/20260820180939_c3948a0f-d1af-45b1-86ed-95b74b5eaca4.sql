UPDATE public.freshness_checks
SET table_name = 'content_items',
    timestamp_column = 'created_at',
    filter_sql = $f$generation_params->>'source' = 'weekly_ready'$f$,
    warn_after_hours = 192,
    error_after_hours = 216,
    claim = 'Monday''s drafts were written'
WHERE check_key = 'weekly_drafts';