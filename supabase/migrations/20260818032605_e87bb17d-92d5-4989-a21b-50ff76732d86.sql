select net.http_post(
  url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret' limit 1)
  ),
  body := '{"dry_run": false}'::jsonb,
  timeout_milliseconds := 180000
) as request_id;