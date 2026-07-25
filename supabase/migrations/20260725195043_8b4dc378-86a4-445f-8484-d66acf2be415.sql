UPDATE public.report_snapshots
SET data = jsonb_set(data, '{template_version}', '"aura-paper-v1"'::jsonb, true)
WHERE NOT jsonb_exists(data, 'template_version');