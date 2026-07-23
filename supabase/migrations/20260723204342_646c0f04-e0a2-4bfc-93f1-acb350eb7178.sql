SELECT net.http_post(
  url:='https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
  headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
  body:='{}'::jsonb
) AS req_id;