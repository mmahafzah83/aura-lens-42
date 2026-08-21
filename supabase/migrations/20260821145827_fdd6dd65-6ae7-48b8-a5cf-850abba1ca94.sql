SELECT cron.unschedule('ef-boot-check-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ef-boot-check-daily');

SELECT cron.schedule(
  'ef-boot-check-daily',
  '20 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/ef-boot-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret'),
      'cron_secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);