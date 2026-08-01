select net.http_post(
  url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/home-address',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
  ),
  body := '{}'::jsonb
) as request_id;