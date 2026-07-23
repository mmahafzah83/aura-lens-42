TRUNCATE public._probe_resp;
DO $$
DECLARE
  v_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret' LIMIT 1);
  v_id bigint; v_status int; v_content text; v_tries int := 0;
BEGIN
  SELECT net.http_post(
    url:= 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret', v_key),
    body:= jsonb_build_object('only_user_id','9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'),
    timeout_milliseconds:= 45000
  ) INTO v_id;
  LOOP
    v_tries := v_tries + 1;
    SELECT status_code, content::text INTO v_status, v_content FROM net._http_response WHERE id = v_id;
    EXIT WHEN v_status IS NOT NULL;
    EXIT WHEN v_tries > 40;
    PERFORM pg_sleep(2);
  END LOOP;
  INSERT INTO public._probe_resp(id,status,content) VALUES (v_id, v_status, v_content);
END $$;