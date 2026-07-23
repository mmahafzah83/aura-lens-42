do $$
declare req_id bigint;
begin
  select net.http_post(
    url:='https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/draft-ready-email',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body:='{}'::jsonb
  ) into req_id;
  perform pg_sleep(8);
  raise notice 'req_id=%', req_id;
end $$;