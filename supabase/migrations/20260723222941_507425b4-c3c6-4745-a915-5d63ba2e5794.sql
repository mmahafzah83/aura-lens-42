DELETE FROM lifecycle_email_log WHERE message_key LIKE 'draft_ready:%';
DELETE FROM lifecycle_email_log WHERE message_key = 'dryrun:draft_ready:d3a28afc-d4fb-4295-85f2-8cf29dd09ca1';
TRUNCATE public._probe_resp;
DO $$
DECLARE
  v_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1);
  v_id bigint;
BEGIN
  SELECT net.http_post(
    url:= 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret', v_key),
    body:= jsonb_build_object('only_user_id','9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'),
    timeout_milliseconds:= 60000
  ) INTO v_id;
  INSERT INTO public._probe_resp(id,status,content) VALUES (v_id, NULL, NULL);
END $$;
SELECT id FROM public._probe_resp ORDER BY ts DESC LIMIT 1;