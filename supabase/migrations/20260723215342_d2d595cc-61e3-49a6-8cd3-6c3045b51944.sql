SELECT
  net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body := '{"only_user_id":"9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3"}'::jsonb
  ) AS r1,
  net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body := '{}'::jsonb
  ) AS r2,
  net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body := '{"only_user_id":"not-a-uuid"}'::jsonb
  ) AS r3;