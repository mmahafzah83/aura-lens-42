CREATE TABLE public.oe_vendor_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  vendor text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  level text NOT NULL CHECK (level IN ('ok','watch','act','stopped')),
  used numeric,
  limit_value numeric,
  remaining numeric,
  unit text,
  refused_24h integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.oe_vendor_health TO authenticated;
GRANT ALL ON public.oe_vendor_health TO service_role;

ALTER TABLE public.oe_vendor_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read vendor health"
  ON public.oe_vendor_health FOR SELECT
  USING (public.is_current_user_admin());

CREATE INDEX oe_vendor_health_vendor_time ON public.oe_vendor_health (vendor, checked_at DESC);

INSERT INTO public.admin_settings (key, value)
VALUES ('founder_alert_email', to_jsonb('mmahafzah8386@gmail.com'::text))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.oe_source_types (code, label_en, label_ar, yields_kinds, structured, typical_refresh)
VALUES ('job_board', 'Job board', 'موقع وظائف', ARRAY['executive_role'], true, 'daily')
ON CONFLICT (code) DO NOTHING;

UPDATE public.oe_policy_versions
SET params = params
  || jsonb_build_object('apify_daily_usd_cap', 3)
  || jsonb_build_object('apify_actors', jsonb_build_array(
       jsonb_build_object('actor','blackfalcondata~bayt-scraper','active',true,'price_per_1k_usd',1.0,
         'countries', jsonb_build_array('AE','SA','QA','KW','BH','OM'),
         'levels', jsonb_build_array('director','executive'), 'max_results', 60),
       jsonb_build_object('actor','blackfalcondata~naukrigulf-scraper','active',true,'price_per_1k_usd',1.0,
         'locations', jsonb_build_array('uae','saudi arabia','qatar','kuwait','bahrain','oman'),
         'max_results', 60),
       jsonb_build_object('actor','fantastic-jobs~career-site-job-listing-api','active',true,'price_per_1k_usd',1.0,
         'max_jobs', 200),
       jsonb_build_object('actor','curious_coder~linkedin-jobs-scraper','active',false,'price_per_1k_usd',5.0,
         'note','held off: the source access law forbids reading LinkedIn; flip active to true here to switch it on'),
       jsonb_build_object('actor','johnvc~google-jobs-scraper','active',true,'price_per_1k_usd',1.0,
         'queries', jsonb_build_array('director Saudi Arabia','head of Saudi Arabia','vice president Dubai','chief officer Riyadh','general manager UAE'),
         'max_pages', 3)
     ))
WHERE active IS TRUE;

SELECT cron.schedule('oe-vendor-health-daily', '0 4 * * *', $q$ do $inner$ begin if public.oe_run_allowed('oe-vendor-health-daily') then perform net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-vendor-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ); end if; end $inner$; $q$);

SELECT cron.schedule('oe-harvest-apify-daily', '30 21 * * *', $q$ do $inner$ begin if public.oe_run_allowed('oe-harvest-apify-daily') then perform net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-harvest-apify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ); end if; end $inner$; $q$);