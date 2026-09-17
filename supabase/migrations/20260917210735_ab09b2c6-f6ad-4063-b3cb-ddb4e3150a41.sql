-- lovable-cron-fallback-reviewed: 1440 runs/day; one-job-per-invocation queue worker, same pattern as job-worker-voice-distill-1min; a slower cadence would delay reading a feed by up to the gap, and freshness is the product.
-- Nightly discovery budget. A parameter addition, not a new policy version.
update public.oe_policy_versions
set params = params || jsonb_build_object('discovery_queries_per_night', 30),
    evidence = coalesce(evidence, '') || E'\n2026-09-17: added params.discovery_queries_per_night = 30 for Step 3 discovery (no version bump; parameter addition only).'
where active = true
  and not (params ? 'discovery_queries_per_night');

-- Pilot feeds only. Everything else stays terms_ok = false.
update public.oe_feeds set terms_ok = true, terms_note = 'public issuer disclosures; read gently; no login'
where name = 'Saudi Exchange issuer announcements — Opening of the Nomination';

update public.oe_feeds set terms_ok = true, terms_note = 'public issuer disclosures; read gently; no login'
where name = 'Saudi Exchange listing and IPO applications';

update public.oe_feeds set terms_ok = true, terms_note = 'open API, CC-BY 4.0'
where name = 'World Bank procurement notices';

update public.oe_feeds set terms_ok = true, terms_note = 'public event calendar; read gently; no login'
where name in ('Luma — Riyadh executive events', 'Luma — Jeddah executive events', 'SaudiCon event calendar');

update public.oe_feeds set terms_ok = true, terms_note = 'public government newsroom; read gently; no login'
where name in ('MCIT newsroom', 'Digital Government Authority newsroom', 'SDAIA newsroom');

update public.oe_feeds set terms_ok = true, terms_note = 'the member forwarded it himself, with consent on record'
where name = 'Member-forwarded messages (WhatsApp, Telegram, LinkedIn, groups)';

update public.oe_feeds set terms_ok = true, terms_note = 'licensed search API; only public pages are read afterwards'
where name = 'Discovery — Perplexity sonar from member faces';

-- Two scheduled jobs, same shape as the ones already running.
select cron.unschedule(jobname) from cron.job where jobname in ('oe-enqueue-feeds-daily','oe-worker-1min');

select cron.schedule(
  'oe-enqueue-feeds-daily',
  '0 22 * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-enqueue-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'oe-worker-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);