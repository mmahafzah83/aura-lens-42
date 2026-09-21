
-- ── 1. LEARNING LEDGER ───────────────────────────────────────────────────
alter table public.oe_labels add column if not exists excluded boolean not null default false;
alter table public.oe_notebook add column if not exists decline_reason text;

create or replace function public.oe_faces_weight_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_stage integer;
begin
  if new.weight is not distinct from old.weight then return new; end if;
  select stage into v_stage from public.oe_learning_stage where user_id = new.user_id;
  if coalesce(v_stage, 0) < 2 then
    raise exception 'weights are frozen below stage 2';
  end if;
  return new;
end $$;

drop trigger if exists oe_faces_weight_guard on public.oe_faces;
create trigger oe_faces_weight_guard
  before update of weight on public.oe_faces
  for each row execute function public.oe_faces_weight_guard();

-- ── 2. THE MEMBER'S OWN RECORD ───────────────────────────────────────────
alter table public.oe_member_evidence add column if not exists own_record boolean not null default true;

update public.oe_member_evidence
set own_record = (source_table in
  ('documents','linkedin_profile_snapshots','linkedin_posts','diagnostic_profiles','assessment_sessions'));

-- The judge's pool. Captured third-party pages (evidence_fragments from
-- source_registry, entries holding somebody else's article) are reading
-- material, never evidence of the member. Only his own documents and his own
-- writing remain.
create or replace function public.oe_member_evidence(p_user_id uuid, p_embedding vector, p_k integer default 8)
returns table(kind text, id uuid, title text, body text, occurred_at timestamp with time zone, distance double precision)
language sql stable security definer set search_path = 'public' as $$
  with pool as (
    select 'document'::text as kind, c.id, coalesce(d.display_title, d.filename) as title, c.content as body,
           c.created_at as occurred_at, (c.embedding <=> p_embedding) as distance
    from public.document_chunks c
    join public.documents d on d.id = c.document_id
    where c.user_id = p_user_id and c.embedding is not null
    union all
    select 'post'::text, p.id, null::text, p.post_text, p.published_at, (p.embedding <=> p_embedding)
    from public.linkedin_posts p
    where p.user_id = p_user_id and p.embedding is not null and p.published_at is not null
  )
  select kind, id, title, body, occurred_at, distance
  from pool order by distance asc limit greatest(1, coalesce(p_k, 8));
$$;

-- ── 3. FEEDS OUTSIDE THE ACCESS LAW ──────────────────────────────────────
update public.oe_feeds
set active = false, terms_ok = false,
    access_finding = 'no_public_listing',
    terms_note = coalesce(terms_note,'') || ' Deactivated 21 Sep: no written basis (audit item 3).'
where name in ('Employer boards — workday', 'Discovery — Perplexity sonar from member faces');

update public.oe_feeds
set active = false, terms_ok = false,
    terms_note = coalesce(terms_note,'') || ' Deactivated 21 Sep: no written basis (audit item 3).'
where name = 'Bahrain e-Tendering public dashboard';

-- A message the member forwards to us is his to forward. Named for what it is.
alter table public.oe_feeds drop constraint if exists oe_feeds_access_finding_check;
alter table public.oe_feeds add constraint oe_feeds_access_finding_check check (
  access_finding = any (array['not_assessed','verified_permissive','robots_allows','robots_disallows',
    'robots_unreadable','tos_prohibits','bot_defended','unreachable','no_public_listing',
    'member_forward','licensed','official_api'])
);

update public.oe_feeds set access_finding = 'member_forward'
where name = 'Member-forwarded messages (WhatsApp, Telegram, LinkedIn, groups)';

alter table public.oe_feeds drop constraint if exists oe_feeds_active_needs_basis;
alter table public.oe_feeds add constraint oe_feeds_active_needs_basis check (
  active is not true
  or (terms_ok is true and access_finding in
      ('robots_allows','verified_permissive','licensed','member_forward','official_api'))
);

-- ── 4. TEXT NORMALISATION, ARABIC INCLUDED ───────────────────────────────
create or replace function public.oe_norm_text(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    regexp_replace(
      translate(
        regexp_replace(lower(coalesce(p,'')), '[\u0640\u064B-\u0652]', '', 'g'),
        'أإآٱىة', 'اااايه'),
      '[^[:alnum:]\u0600-\u06FF]+', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

alter table public.oe_opportunities add column if not exists verify_reason text;
alter table public.oe_opportunities add column if not exists read_result text;

-- ── 5. THE CLASSIFIER READS ARABIC ON ITS OWN TERMS ──────────────────────
alter table public.oe_opportunity_kinds add column if not exists require_ar text;
alter table public.oe_opportunity_kinds add column if not exists exclude_ar text;

update public.oe_opportunity_kinds
set detect_ar = detect_ar || '|فتح باب الترشح|الترشح لعضوية مجلس|المادة 65|المادة الخامسة والستين',
    exclude_en = '\y(faculty|professor|lecturer|researcher|post-?doc|research fellow|teaching)\y'
where code = 'board_seat';

create or replace function public.oe_classify_kind(o oe_opportunities)
returns text language plpgsql stable set search_path = 'public' as $$
DECLARE v_text text; v_offer boolean; v_hiring boolean; k record;
BEGIN
  -- The law: a shape may never outrank its state.
  IF o.access_state IN ('observed_event','possible_need') THEN RETURN 'market_signal'; END IF;

  v_text := left(concat_ws(' ',
    COALESCE(o.title,''), COALESCE(o.scope,''), COALESCE(o.evidence_quote,''),
    COALESCE(o.chair_type,''),
    COALESCE((o.raw - 'page_text' - 'html' - 'model')::text,'')), 20000);

  v_offer := v_text ~* '\y((media|ecosystem|knowledge|content|community) partner|sponsorship|partnership opportunit|partner with us|call for (speakers|papers|nominations|chapters|entries))';

  v_hiring := NOT v_offer AND (
    (o.route_kind = 'application' AND o.discovery_kind = 'posted_opening')
    OR o.deadline IS NOT NULL);

  FOR k IN SELECT code, detect_en, detect_ar, require_en, exclude_en, require_ar, exclude_ar
           FROM public.oe_opportunity_kinds ORDER BY sort_order, code LOOP
    CONTINUE WHEN v_hiring AND k.code IN (
      'investment_partnership','speaking_platform','professional_membership',
      'authoring_publication','award_judging','executive_teaching');

    -- English shapes are tested with the English words, Arabic shapes with the
    -- Arabic ones. A record never passes on one language's detector while the
    -- other language's exclusion refuses it.
    IF (NULLIF(k.detect_en,'') IS NOT NULL AND v_text ~* k.detect_en)
       AND (NULLIF(k.require_en,'') IS NULL OR v_text ~* k.require_en OR v_hiring)
       AND (NULLIF(k.exclude_en,'') IS NULL OR v_text !~* k.exclude_en)
    THEN RETURN k.code; END IF;

    IF (NULLIF(k.detect_ar,'') IS NOT NULL AND v_text ~ k.detect_ar)
       AND (NULLIF(k.require_ar,'') IS NULL OR v_text ~ k.require_ar OR v_hiring)
       AND (NULLIF(k.exclude_ar,'') IS NULL OR v_text !~ k.exclude_ar)
       AND (NULLIF(k.exclude_en,'') IS NULL OR v_text !~* k.exclude_en)
    THEN RETURN k.code; END IF;
  END LOOP;

  RETURN 'market_signal';
END $$;

-- ── 6. NEW INVARIANT VIEWS ───────────────────────────────────────────────
create or replace view public.oe_quote_not_in_raw as
  select o.id, o.language, o.title, o.source_url
  from public.oe_opportunities o
  where o.alive and o.quote_verified
    and public.oe_norm_text(o.evidence_quote) <> ''
    and position(public.oe_norm_text(o.evidence_quote)
                 in public.oe_norm_text(coalesce(o.raw->>'page_text',''))) = 0;

create or replace view public.oe_card_cites_foreign_evidence as
  select c.id as card_id, c.user_id, c.card_date, c.opportunity_id, cited.id as cited_id
  from public.oe_cards c
  join public.oe_serves s on s.card_id = c.id
  cross join lateral (
    select (value #>> '{}')::uuid as id
    from jsonb_array_elements(coalesce(to_jsonb(c.cited_ids), '[]'::jsonb)) value
    where (value #>> '{}') ~* '^[0-9a-f-]{36}$'
  ) cited
  where not exists (select 1 from public.linkedin_posts p where p.id = cited.id and p.user_id = c.user_id)
    and not exists (select 1 from public.document_chunks d where d.id = cited.id and d.user_id = c.user_id)
    and not exists (select 1 from public.oe_member_evidence e where e.id = cited.id and e.user_id = c.user_id and e.own_record);

create or replace view public.oe_judge_disagreement as
  select m.id as match_id, m.user_id, m.opportunity_id, o.title, m.score_avg, m.lane_final
  from public.oe_matches m
  join public.oe_opportunities o on o.id = m.opportunity_id and o.alive
  join public.oe_serves s on s.opportunity_id = m.opportunity_id and s.user_id = m.user_id
  where m.lane_final = 'act'
    and (
      exists (select 1 from jsonb_array_elements(coalesce(m.scores->'passes','[]'::jsonb)) p
              where p->>'eligibility_met' = 'false')
      or m.score_avg < coalesce((select (params->>'gate_min_avg')::numeric
                                 from public.oe_policy_versions where active limit 1), 3.0)
    );

create or replace view public.oe_gate_contradiction as
  select m.id as match_id, m.user_id, m.opportunity_id, o.title,
         m.screen_gate, m.screen_outcome, m.lane_final, m.rejection_sentence,
         'gate_passed_with_rejection'::text as contradiction
  from public.oe_matches m
  join public.oe_opportunities o on o.id = m.opportunity_id and o.alive
  where m.gate_passed is true and m.rejection_sentence is not null
  union all
  select d.match_id, d.user_id, d.opportunity_id, d.title,
         null::text, null::text, d.lane_final, null::text,
         'served_act_card_the_rubric_refuses'::text
  from public.oe_judge_disagreement d;

grant select on public.oe_quote_not_in_raw, public.oe_card_cites_foreign_evidence,
  public.oe_judge_disagreement, public.oe_gate_contradiction to authenticated, service_role;

-- ── 7. THE RLS PROBE RUNS DAILY ──────────────────────────────────────────
select cron.unschedule('oe-rls-probe-daily') where exists (select 1 from cron.job where jobname='oe-rls-probe-daily');
select cron.schedule('oe-rls-probe-daily', '35 5 * * *', $cron$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-rls-probe',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name in ('cron_secret','CRON_SECRET') limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cron$);
