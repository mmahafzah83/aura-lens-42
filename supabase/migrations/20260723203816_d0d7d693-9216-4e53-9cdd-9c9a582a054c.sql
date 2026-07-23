
DO $$
DECLARE req_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
    body := '{}'::jsonb
  ) INTO req_id;
  PERFORM pg_sleep(25);
END $$;
