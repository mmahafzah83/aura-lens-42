insert into public.oe_feeds
  (name, lane, kind, url, country, language, source_type, terms_ok, access_finding,
   terms_note, cadence, active, read_method, owner, last_fetched_at)
select * from (values
  ('Umm al-Qura gazette', 'official', 'listing', 'https://www.uqn.gov.sa/rss', 'SA', 'ar',
   'newsroom', true, 'robots_allows',
   'Read from the edge 22 Sep 2026: HTTP 200, robots.txt 200, path not disallowed. Official gazette; a named appointment is a signal, never a vacancy, and no person is named on a card.',
   'daily', true, 'html_list', 'aura', now()),
  ('Islamic Development Bank — project procurement', 'official', 'listing', 'https://www.isdb.org/project-procurement', 'SA', 'en',
   'multilateral_procurement', true, 'robots_allows',
   'Read from the edge 22 Sep 2026: HTTP 200, robots.txt 200, path not disallowed. Firm tenders route to not_for_individuals; only an individual-consultant notice reaches a person.',
   'daily', true, 'html_list', 'aura', now()),
  ('OPEC Fund — procurement', 'official', 'listing', 'https://opecfund.org/procurement', 'AT', 'en',
   'multilateral_procurement', true, 'robots_allows',
   'Read from the edge 22 Sep 2026: HTTP 200; robots.txt returned 404, so the host publishes no crawl rules. Firm tenders route to not_for_individuals.',
   'weekly', true, 'html_list', 'aura', now()),
  ('Dubai Financial Market — eBoard', 'official', 'listing', 'https://www.dfm.ae/the-exchange/news-disclosures/e-board', 'AE', 'en',
   'market_disclosure', true, 'robots_allows',
   'Read from the edge 22 Sep 2026: HTTP 200, robots.txt 200, path not disallowed. Listed-company board positions.',
   'daily', true, 'html_list', 'aura', now()),
  ('MENA Stevie Awards — judging', 'open', 'listing', 'https://mena.stevieawards.com/Judges/you-be-the-judge', 'AE', 'en',
   'award_programme', true, 'robots_allows',
   'Read from the edge 22 Sep 2026: HTTP 200, robots.txt 200, path not disallowed. Judging seats are self-nominated; entry deadlines 28 Oct and 26 Nov 2026.',
   'monthly', true, 'html_list', 'aura', now())
) as v(name, lane, kind, url, country, language, source_type, terms_ok, access_finding,
       terms_note, cadence, active, read_method, owner, last_fetched_at)
where not exists (select 1 from public.oe_feeds f where f.url = v.url or f.name = v.name);

-- The four that refused today, recorded against the rows that already hold them.
update public.oe_feeds set
  access_finding = 'unreachable', active = false, terms_ok = false, cadence = 'paused',
  last_fetched_at = now(),
  terms_note = coalesce(terms_note || ' | ', '') ||
    '22 Sep 2026: three edge fetches (Arabic page, English page, host root) all aborted at the 20 second timeout. No page was read, so nothing was seeded.'
where url ilike '%istitlaa.ncc.gov.sa%';

update public.oe_feeds set
  access_finding = 'no_public_listing', active = false, terms_ok = false, cadence = 'paused',
  last_fetched_at = now(),
  terms_note = coalesce(terms_note || ' | ', '') ||
    '22 Sep 2026: HTTP 200, but the site is a holding page announcing a new website. No candidacy form and no committee list were published, so nothing was seeded.'
where url ilike '%fsc.org.sa%';

update public.oe_feeds set
  access_finding = 'no_public_listing', active = false, terms_ok = false, cadence = 'paused',
  last_fetched_at = now(),
  terms_note = coalesce(terms_note || ' | ', '') ||
    '22 Sep 2026: cma.org.sa/en/Market/Pages/default.aspx returned HTTP 200 with 247 characters of visible text — the list is built in the browser. No issuer name was read, so no organisation was seeded.'
where url ilike '%cma.org.sa%';

update public.oe_feeds set
  access_finding = 'bot_defended', active = false, terms_ok = false, cadence = 'out',
  last_fetched_at = now(),
  terms_note = coalesce(terms_note || ' | ', '') ||
    '22 Sep 2026: the issuer directory returned HTTP 403 and robots.txt returned 403. The host refuses. Nothing seeded, nothing scheduled.'
where url ilike '%saudiexchange.sa%';