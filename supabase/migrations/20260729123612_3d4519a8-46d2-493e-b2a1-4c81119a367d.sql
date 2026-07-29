select cron.unschedule('tmp-morning-signal-test');

select cron.schedule(
  'tmp-morning-signal-quiet',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/send-morning-signal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{"dry_run": true, "only_user_id": "83f6db89-6937-4407-a907-a62e7ce04e3f"}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);