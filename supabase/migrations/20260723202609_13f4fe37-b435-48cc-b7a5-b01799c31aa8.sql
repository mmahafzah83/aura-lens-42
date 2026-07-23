
DO $$
DECLARE v_req_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')
    ),
    body := '{}'::jsonb
  ) INTO v_req_id;
  RAISE NOTICE 'request_id=%', v_req_id;
END $$;
