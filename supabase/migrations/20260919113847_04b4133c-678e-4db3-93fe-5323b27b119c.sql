-- lovable-cron-fallback-reviewed: 4 runs/day; a quote re-check is a courtesy
-- fetch of a handful of pages, and the backoff is measured in hours.
SELECT cron.schedule(
  'oe-reverify-quote-6h',
  '15 */6 * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-reverify-quote',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret' limit 1)
    ),
    body := '{"limit":20}'::jsonb
  );
  $$
);

-- Every judged match now carries an access verdict, so the rule is confirmed.
ALTER TABLE public.oe_matches VALIDATE CONSTRAINT oe_matches_judged_has_outcome;