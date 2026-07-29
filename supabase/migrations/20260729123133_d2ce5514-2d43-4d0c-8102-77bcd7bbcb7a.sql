select cron.schedule(
  'tmp-morning-signal-test',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/send-morning-signal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{"dry_run": true, "only_user_id": "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3"}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);