DELETE FROM lifecycle_email_log WHERE message_key LIKE 'dryrun:draft_ready:%' OR message_key LIKE 'draft_ready:%';
TRUNCATE public._probe_resp;
DO $$
DECLARE
  v_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1);
  v_full bigint; v_bad bigint;
BEGIN
  SELECT net.http_post(
    url:= 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret', v_key),
    body:= '{}'::jsonb,
    timeout_milliseconds:= 60000
  ) INTO v_full;
  SELECT net.http_post(
    url:= 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret', v_key),
    body:= jsonb_build_object('only_user_id','not-a-uuid'),
    timeout_milliseconds:= 60000
  ) INTO v_bad;
  INSERT INTO public._probe_resp(id,status,content) VALUES (v_full,NULL,'FULL'),(v_bad,NULL,'BAD');
END $$;
SELECT id, content FROM public._probe_resp ORDER BY ts;