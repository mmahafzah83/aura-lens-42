select cron.unschedule('send-morning-signal-daily') where exists (select 1 from cron.job where jobname = 'send-morning-signal-daily');

select cron.schedule(
  'send-morning-signal-daily',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/send-morning-signal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{"dry_run": true}'::jsonb
  ) as request_id;
  $$
);