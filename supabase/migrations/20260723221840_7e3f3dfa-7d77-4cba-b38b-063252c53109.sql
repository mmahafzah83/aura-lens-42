CREATE TABLE IF NOT EXISTS public._probe_resp (id bigint, status int, content text, ts timestamptz default now());
DO $$
DECLARE
  v_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1);
  v_id bigint;
BEGIN
  SELECT net.http_post(
    url:= 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret', v_key),
    body:= jsonb_build_object('only_user_id','9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3')
  ) INTO v_id;
  PERFORM pg_sleep(10);
  INSERT INTO public._probe_resp(id,status,content)
  SELECT v_id, status_code, content::text FROM net._http_response WHERE id=v_id;
END $$;