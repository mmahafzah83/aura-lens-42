-- 03 — functions and procedures (extension-owned functions excluded).
CREATE OR REPLACE FUNCTION public._clone_member_rows(p_table text, p_donor uuid, p_target uuid, p_limit integer, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cols text; v_vals text; v_sql text; v_n int;
BEGIN
  /* Generated columns (entries.tsv) and the primary key must never be copied. */
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(
           CASE
             WHEN column_name = 'user_id' THEN quote_literal(p_target) || '::uuid'
             WHEN p_overrides ? column_name THEN '(' || quote_literal(p_overrides ->> column_name) || ')::' || data_type
             ELSE 's.' || quote_ident(column_name)
           END, ', ' ORDER BY ordinal_position)
    INTO v_cols, v_vals
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table
    AND is_generated = 'NEVER' AND identity_generation IS NULL
    AND column_name <> 'id';

  v_sql := format(
    'INSERT INTO public.%I (%s) SELECT %s FROM (SELECT * FROM public.%I WHERE user_id = $1 ORDER BY created_at DESC LIMIT %s) s',
    p_table, v_cols, v_vals, p_table, p_limit);
  EXECUTE v_sql USING p_donor;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$
;

CREATE OR REPLACE FUNCTION public.activate_design_version(p_new_tokens jsonb, p_created_by uuid DEFAULT '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_version INTEGER;
  v_new_id UUID;
BEGIN
  -- Get current version number
  SELECT COALESCE(MAX(version), 0) INTO v_current_version
  FROM public.design_system WHERE scope = 'global';

  -- Deactivate current
  UPDATE public.design_system
  SET is_active = false, updated_at = now()
  WHERE scope = 'global' AND is_active = true;

  -- Insert new version
  INSERT INTO public.design_system (scope, version, is_active, tokens, created_by)
  VALUES ('global', v_current_version + 1, true, p_new_tokens, p_created_by)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_cohorts()
 RETURNS TABLE(cohort_week date, size integer, captured integer, got_signal integer, linkedin_live integer, opened_writer integer, has_draft integer, published integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  RETURN QUERY
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
      AND coalesce(u.email, '') NOT ILIKE '%test%'
  )
  SELECT
    date_trunc('week', ru.created_at)::date,
    count(*)::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM entries e WHERE e.user_id = ru.id))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM strategic_signals s WHERE s.user_id = ru.id))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM linkedin_connections l WHERE l.user_id = ru.id AND l.status = 'active'))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events p WHERE p.user_id = ru.id AND p.event = 'composer_opened'))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM content_items c WHERE c.user_id = ru.id AND c.status = 'draft')
                        OR EXISTS (SELECT 1 FROM linkedin_posts lp WHERE lp.user_id = ru.id AND lp.tracking_status = 'draft'
                                     AND lp.source_type IN ('aura_generated','carousel_studio')))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM linkedin_posts lp WHERE lp.user_id = ru.id AND lp.tracking_status = 'published'))::int
  FROM ru
  GROUP BY 1
  ORDER BY 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_cron_failures_24h()
 RETURNS TABLE(jobname text, failed integer, last_fail timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT j.jobname, COUNT(*)::int AS failed, MAX(d.start_time) AS last_fail
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.status = 'failed'
    AND d.start_time >= now() - interval '24 hours'
  GROUP BY j.jobname
  ORDER BY failed DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_economics_denominators()
 RETURNS TABLE(active_users integer, published_posts integer, signals_delivered integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH real_users AS (
    SELECT u.id FROM auth.users u
    WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
      AND coalesce(u.email, '') NOT ILIKE '%test%'
      AND coalesce(u.email, '') NOT ILIKE '%@example.com'
  )
  SELECT
    (SELECT count(DISTINCT l.user_id)::integer FROM public.ai_usage_log l
      WHERE l.created_at >= date_trunc('month', now()) AND l.user_id IS NOT NULL),
    (SELECT count(*)::integer FROM public.linkedin_posts p
      WHERE p.tracking_status = 'published'
        AND p.created_at >= date_trunc('month', now())
        AND p.user_id IN (SELECT id FROM real_users)),
    (SELECT count(*)::integer FROM public.strategic_signals s
      WHERE s.created_at >= date_trunc('month', now())
        AND s.user_id IN (SELECT id FROM real_users))
  WHERE public.is_current_user_admin()
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_crons()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_status text, last_start timestamp with time zone, last_msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select j.jobid, j.jobname, j.schedule, j.active,
           r.status, r.start_time, left(coalesce(r.return_message,''),200)
    from cron.job j
    left join lateral (
      select d.status, d.start_time, d.return_message
      from cron.job_run_details d
      where d.jobid = j.jobid
      order by d.start_time desc
      limit 1
    ) r on true
    order by j.jobname;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_run_cron(p_jobid bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'vault'
AS $function$
declare cmd text; jn text;
begin
  if not public.is_current_user_admin() then
    raise exception 'not authorized';
  end if;
  select command, jobname into cmd, jn from cron.job where jobid = p_jobid;
  if cmd is null then raise exception 'job % not found', p_jobid; end if;
  execute cmd;
  insert into public.admin_action_log(actor_id, action, task, target_ref, result)
  values (auth.uid(), 'run_cron', 'run_cron', jn, 'triggered');
  return 'triggered';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_spend_by_function(p_months_back integer DEFAULT 0)
 RETURNS TABLE(function_name text, spend numeric, calls integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(u.function_name, 'unknown')::text,
         round(coalesce(sum(u.est_cost_usd), 0)::numeric, 4),
         count(*)::integer
  FROM public.ai_usage_log u
  WHERE public.is_current_user_admin()
    AND u.created_at >= date_trunc('month', now()) - make_interval(months => greatest(p_months_back, 0))
    AND u.created_at <  date_trunc('month', now()) - make_interval(months => greatest(p_months_back, 0)) + interval '1 month'
  GROUP BY 1
  ORDER BY 2 DESC
$function$
;

CREATE OR REPLACE FUNCTION public.admin_spend_daily(p_days integer DEFAULT 30)
 RETURNS TABLE(day date, spend numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d::date,
         round(coalesce((
           SELECT sum(u.est_cost_usd) FROM public.ai_usage_log u
           WHERE u.created_at >= d AND u.created_at < d + interval '1 day'
         ), 0)::numeric, 4)
  FROM generate_series(
         date_trunc('day', now()) - make_interval(days => greatest(p_days, 1) - 1),
         date_trunc('day', now()),
         interval '1 day') AS d
  WHERE public.is_current_user_admin()
  ORDER BY 1
$function$
;

CREATE OR REPLACE FUNCTION public.admin_stage_timeline(p_days integer DEFAULT 90)
 RETURNS TABLE(day date, signed_up integer, finished_setup integer, captured integer, got_signal integer, linkedin_live integer, opened_writer integer, has_draft integer, published integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  RETURN QUERY
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
      AND coalesce(u.email, '') NOT ILIKE '%test%'
  ),
  reached AS (
    SELECT
      ru.created_at::date AS signed_up_on,
      (SELECT min(d.created_at)::date FROM diagnostic_profiles d WHERE d.user_id = ru.id) AS setup_on,
      (SELECT min(e.created_at)::date FROM entries e WHERE e.user_id = ru.id) AS captured_on,
      (SELECT min(s.created_at)::date FROM strategic_signals s WHERE s.user_id = ru.id) AS signal_on,
      (SELECT min(l.created_at)::date FROM linkedin_connections l WHERE l.user_id = ru.id AND l.status = 'active') AS linkedin_on,
      (SELECT min(p.occurred_at)::date FROM product_events p WHERE p.user_id = ru.id AND p.event = 'composer_opened') AS writer_on,
      LEAST(
        (SELECT min(c.created_at)::date FROM content_items c WHERE c.user_id = ru.id AND c.status = 'draft'),
        (SELECT min(lp.created_at)::date FROM linkedin_posts lp WHERE lp.user_id = ru.id AND lp.tracking_status = 'draft'
           AND lp.source_type IN ('aura_generated','carousel_studio'))
      ) AS draft_on,
      (SELECT min(coalesce(lp.published_at, lp.created_at))::date FROM linkedin_posts lp
        WHERE lp.user_id = ru.id AND lp.tracking_status = 'published') AS published_on
    FROM ru
  ),
  days AS (
    SELECT generate_series(now()::date - greatest(coalesce(p_days, 90), 1) + 1, now()::date, '1 day')::date AS d
  )
  SELECT
    days.d,
    count(*) FILTER (WHERE r.signed_up_on  <= days.d)::int,
    count(*) FILTER (WHERE r.setup_on      <= days.d)::int,
    count(*) FILTER (WHERE r.captured_on   <= days.d)::int,
    count(*) FILTER (WHERE r.signal_on     <= days.d)::int,
    count(*) FILTER (WHERE r.linkedin_on   <= days.d)::int,
    count(*) FILTER (WHERE r.writer_on     <= days.d)::int,
    count(*) FILTER (WHERE r.draft_on      <= days.d)::int,
    count(*) FILTER (WHERE r.published_on  <= days.d)::int
  FROM days CROSS JOIN reached r
  GROUP BY days.d
  ORDER BY days.d;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.brief_history(days integer DEFAULT 30)
 RETURNS TABLE(brief_date date, runs integer, sent boolean, funnel jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Deliberately reports the FIRST run of each day. The first run is the honest
  -- one: it is what was actually true that morning, before anyone pressed
  -- refresh. Using the latest run would let today's refresh silently rewrite
  -- last week's trend line.
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT
    s.brief_date,
    count(*)::int,
    bool_or(s.is_sent),
    (SELECT f.payload->'funnel'
       FROM public.daily_brief_snapshots f
      WHERE f.brief_date = s.brief_date
      ORDER BY f.run_seq ASC
      LIMIT 1)
  FROM public.daily_brief_snapshots s
  WHERE s.brief_date > (now()::date - greatest(coalesce(days, 30), 1))
  GROUP BY s.brief_date
  ORDER BY s.brief_date DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_signal_engagement(p_signal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_signal_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.signal_engagements (user_id, signal_id, open_count, last_opened_at)
  VALUES (v_uid, p_signal_id, 1, now())
  ON CONFLICT (user_id, signal_id)
  DO UPDATE SET open_count = public.signal_engagements.open_count + 1,
                last_opened_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.capture_request_snapshots()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
DECLARE
  v_inserted integer := 0;
BEGIN
  BEGIN
    INSERT INTO public.request_snapshots (response_id, requested_at, status_code, error_msg, url, failure_kind)
    SELECT r.id, r.created, r.status_code, r.error_msg, q.url,
           public.classify_request_failure(r.status_code, r.error_msg)
    FROM net._http_response r
    LEFT JOIN net.http_request_queue q ON q.id = r.id
    WHERE NOT EXISTS (SELECT 1 FROM public.request_snapshots s WHERE s.response_id = r.id)
    ON CONFLICT (response_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    DELETE FROM public.request_snapshots WHERE captured_at < now() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
  RETURN v_inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_invite_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_sent_at timestamptz;
  v_found boolean := false;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT true,
         CASE WHEN u.confirmation_token = p_token THEN u.confirmation_sent_at
              ELSE u.recovery_sent_at END
    INTO v_found, v_sent_at
    FROM auth.users u
   WHERE (u.confirmation_token = p_token AND u.confirmation_token <> '')
      OR (u.recovery_token = p_token AND u.recovery_token <> '')
   LIMIT 1;

  IF NOT COALESCE(v_found, false) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_sent_at IS NULL OR v_sent_at < now() - interval '24 hours' THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  RETURN jsonb_build_object('status', 'valid');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_assessment_session(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode='P0001'; end if;
  update public.assessment_sessions
     set user_id = v_uid, last_seen_at = now(), expires_at = now() + interval '10 years'
   where token = p_token and user_id is null and expires_at > now()
   returning id into v_id;
  if v_id is null then raise exception 'NO_CLAIMABLE_SESSION' using errcode='P0001'; end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_job(p_job_type text, p_worker text)
 RETURNS SETOF job_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.job_queue
    WHERE job_type = p_job_type
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue q
  SET status = 'claimed',
      claimed_at = now(),
      claimed_by = p_worker,
      attempts = q.attempts + 1,
      updated_at = now()
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.classify_request_failure(p_status integer, p_error text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_status = 200 THEN 'ok'
    WHEN p_status IS NOT NULL AND p_status <> 200 THEN 'http_error'
    WHEN p_status IS NULL AND coalesce(p_error,'') ILIKE '%timeout%' THEN
      CASE
        WHEN (substring(p_error from 'DNS time: ([0-9.]+)'))::numeric IS NOT NULL
             AND (substring(p_error from 'Total time: ([0-9.]+)'))::numeric IS NOT NULL
             AND (substring(p_error from 'DNS time: ([0-9.]+)'))::numeric
                 >= 0.9 * (substring(p_error from 'Total time: ([0-9.]+)'))::numeric
        THEN 'never_left'
        ELSE 'timed_out'
      END
    ELSE 'unknown'
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.cockpit_freshness()
 RETURNS TABLE(check_key text, claim text, last_row_at timestamp with time zone, hours_stale numeric, state text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c record;
  v_last timestamptz;
  v_hours numeric;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  FOR c IN SELECT * FROM public.freshness_checks WHERE enabled ORDER BY check_key LOOP
    v_last := NULL;
    BEGIN
      EXECUTE format(
        'SELECT max(%I) FROM public.%I %s',
        c.timestamp_column,
        c.table_name,
        CASE WHEN coalesce(c.filter_sql,'') = '' THEN '' ELSE 'WHERE ' || c.filter_sql END
      ) INTO v_last;
    EXCEPTION WHEN OTHERS THEN
      v_last := NULL;
    END;

    IF v_last IS NULL THEN
      check_key := c.check_key; claim := c.claim; last_row_at := NULL;
      hours_stale := NULL; state := 'NO_DATA';
    ELSE
      v_hours := round(EXTRACT(EPOCH FROM (now() - v_last)) / 3600.0, 2);
      check_key := c.check_key; claim := c.claim; last_row_at := v_last; hours_stale := v_hours;
      state := CASE
        WHEN v_hours >= c.error_after_hours THEN 'FAIL'
        WHEN v_hours >= c.warn_after_hours THEN 'WARN'
        ELSE 'OK'
      END;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_job(p_id uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempts int;
  v_max int;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max
  FROM public.job_queue WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_success THEN
    UPDATE public.job_queue
    SET status = 'done', last_error = NULL, updated_at = now()
    WHERE id = p_id;
  ELSIF v_attempts >= v_max THEN
    UPDATE public.job_queue
    SET status = 'dead', last_error = p_error, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.job_queue
    SET status = 'pending',
        last_error = p_error,
        scheduled_for = now() + (interval '1 minute' * power(3, v_attempts)),
        updated_at = now()
    WHERE id = p_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.content_items_tsv_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.body, ''));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_assessment_session(p_ip_hash text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text; v_recent int;
begin
  if p_ip_hash is not null then
    select count(*) into v_recent from public.assessment_sessions
      where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';
    if v_recent >= 3 then
      raise exception 'RATE_LIMIT_IP' using errcode = 'P0001';
    end if;
  end if;
  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(replace(replace(v_token,'+','-'),'/','_'),'=','');
  insert into public.assessment_sessions(token, ip_hash) values (v_token, p_ip_hash);
  return v_token;
end $function$
;

CREATE OR REPLACE FUNCTION public.daily_brief_snapshots_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'daily_brief_snapshots is append-only: % is forbidden. Record a correction as a new run.',
    TG_OP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decisions_due(p_on date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, decided_on date, title text, decision text, expected_outcome text, metric_key text, baseline_value numeric, expected_value numeric, review_on date, days_overdue integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.decided_on, d.title, d.decision, d.expected_outcome,
         d.metric_key, d.baseline_value, d.expected_value, d.review_on,
         (coalesce(p_on, now()::date) - d.review_on)::int
  FROM public.decisions d
  WHERE d.status = 'open'
    AND d.review_on IS NOT NULL
    AND d.review_on <= coalesce(p_on, now()::date)
  ORDER BY d.review_on ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', r.table_name) USING p_user_id;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_seniority_band(headline text)
 RETURNS seniority_band
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when headline is null or btrim(headline)='' then null
    when headline ~* '\mchief (specialist|engineer|accountant|analyst|architect|nurse|pharmacist)\M' then 'table'::seniority_band
    when headline ~* '(\mchief \w+ officer\M|\mc[efiotmdhr]o\M|\mfounder\M|co-founder|\mpresident\M|managing partner|managing director|\mowner\M|group (head|ceo)|\mchairman\M|board member|\mboard\M|\msvp\M|\mevp\M|\mvp\M|vice president)' then 'room'::seniority_band
    when headline ~* '(\mdirector\M|\mpartner\M|head of|general manager|\mgm\M|senior manager|associate director|\mprincipal\M|\mfellow\M|\madvisor\M|\madviser\M)' then 'table'::seniority_band
    when headline ~* '(\mmanager\M|\mlead\M|\msenior\M|\mconsultant\M|\mspecialist\M|\mengineer\M|\manalyst\M|\massociate\M)' then 'work'::seniority_band
    else null end;
$function$
;

CREATE OR REPLACE FUNCTION public.document_briefs_tsv_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.thesis, '') || ' ' ||
    coalesce(NEW.author_pov, '') || ' ' ||
    coalesce((SELECT string_agg(x->>'claim', ' ') FROM jsonb_array_elements(coalesce(NEW.key_points, '[]'::jsonb)) x), '') || ' ' ||
    coalesce((SELECT string_agg(x->>'claim', ' ') FROM jsonb_array_elements(coalesce(NEW.key_figures, '[]'::jsonb)) x), ''));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_crons_ran_without_sends(p_hours integer DEFAULT 24)
 RETURNS TABLE(crons_ran integer, rows_added integer, ran_jobs text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  WITH ran AS (
    SELECT DISTINCT j.jobname
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname IN (
      'check-lifecycle-triggers-daily',
      'lifecycle-emails-ksa-daytime',
      'aura-card-nudge-daily'
    )
      AND d.status = 'succeeded'
      AND d.start_time > now() - (p_hours || ' hours')::interval
  )
  SELECT
    (SELECT count(*)::int FROM ran),
    (SELECT count(*)::int FROM public.lifecycle_email_log
       WHERE sent_at > now() - (p_hours || ' hours')::interval),
    (SELECT COALESCE(array_agg(jobname ORDER BY jobname), ARRAY[]::text[]) FROM ran);
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_published_authorship()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.published_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.authorship IS NULL
     OR NEW.authorship NOT IN ('aura_drafted','aura_assisted','user_written','unknown') THEN
    IF NEW.source_type = 'aura_generated' THEN
      NEW.authorship := 'aura_drafted';
    ELSIF NEW.source_type IN ('linkedin_export','csv_import','linkedin_own') THEN
      NEW.authorship := 'user_written';
    ELSE
      NEW.authorship := 'unknown';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_voice_distill_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int := 0;
BEGIN
  WITH base AS (
    SELECT
      lp.user_id,
      COUNT(*)::int AS total_corpus,
      (
        SELECT MAX(tl.created_at)
        FROM public.training_logs tl
        WHERE tl.user_id = lp.user_id
          AND tl.pillar = 'voice_distill'
      ) AS last_run
    FROM public.linkedin_posts lp
    WHERE lp.source_type = 'aura_generated'
      AND lp.tracking_status = 'published'
      AND lp.post_text IS NOT NULL
      AND lp.user_id IS NOT NULL
    GROUP BY lp.user_id
  ),
  scored AS (
    SELECT
      b.user_id,
      b.total_corpus,
      b.last_run,
      (
        SELECT COUNT(*)::int
        FROM public.linkedin_posts lp2
        WHERE lp2.user_id = b.user_id
          AND lp2.source_type = 'aura_generated'
          AND lp2.tracking_status = 'published'
          AND lp2.post_text IS NOT NULL
          AND (b.last_run IS NULL OR lp2.published_at > b.last_run)
      ) AS new_since,
      CASE
        WHEN b.last_run IS NULL THEN 9999
        ELSE LEAST(9999, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - b.last_run)) / 86400)::int))
      END AS days_since
    FROM base b
  ),
  eligible AS (
    SELECT *
    FROM scored
    WHERE total_corpus >= 5
      AND (last_run IS NULL OR new_since >= 3 OR days_since >= 30)
  ),
  ins AS (
    INSERT INTO public.job_queue (job_type, user_id, payload, priority)
    SELECT
      'voice_distill',
      user_id,
      jsonb_build_object(
        'total_corpus', total_corpus,
        'new_since',    new_since,
        'days_since',   days_since
      ),
      days_since
    FROM eligible
    ON CONFLICT (job_type, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'claimed'::text]))
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_diagnostic_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.diagnostic_profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.evidence_fragments_tsv_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.excluded_user_ids()
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id FROM public.diagnostic_profiles p WHERE p.account_type <> 'customer';
$function$
;

CREATE OR REPLACE FUNCTION public.founder_brief_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'cron'
AS $function$
DECLARE
  excluded uuid[] := ARRAY(SELECT e.user_id FROM public.excluded_user_ids() e);
  ru uuid[];
  out jsonb;
BEGIN
  SELECT array_agg(id) INTO ru FROM auth.users u
   WHERE u.id <> ALL(excluded) AND coalesce(u.email,'') NOT ILIKE '%test%';
  ru := coalesce(ru, ARRAY[]::uuid[]);

  SELECT jsonb_build_object(
    'generated_at', now(),
    'excluded_test_users', (SELECT count(*) FROM auth.users WHERE coalesce(email,'') ILIKE '%test%'),
    'funnel', jsonb_build_object(
      'invited', cardinality(ru),
      'signed_in', (SELECT count(*) FROM auth.users WHERE id = ANY(ru) AND last_sign_in_at IS NOT NULL),
      'signed_in_xc', (SELECT count(DISTINCT user_id) FROM diagnostic_profiles WHERE user_id = ANY(ru)),
      'finished_setup', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru)),
      'captured', (SELECT count(DISTINCT user_id) FROM entries WHERE user_id = ANY(ru)),
      'captured_xc', (SELECT count(DISTINCT user_id) FROM captures WHERE user_id = ANY(ru)),
      'got_signal', (SELECT count(DISTINCT user_id) FROM strategic_signals WHERE user_id = ANY(ru)),
      'linkedin_live', (SELECT count(DISTINCT user_id) FROM linkedin_connections WHERE user_id = ANY(ru) AND status = 'active'),
      'linkedin_live_xc', (SELECT count(DISTINCT user_id) FROM linkedin_connections WHERE user_id = ANY(ru) AND access_token IS NOT NULL),
      'opened_writer', (SELECT count(DISTINCT user_id) FROM product_events WHERE user_id = ANY(ru) AND event = 'composer_opened'),
      'has_draft', (SELECT count(*) FROM (
          SELECT user_id FROM content_items WHERE user_id = ANY(ru) AND status = 'draft'
          UNION
          SELECT user_id FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status = 'draft'
            AND source_type IN ('aura_generated','carousel_studio')
        ) d),
      'published', (SELECT count(DISTINCT user_id) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status = 'published'),
      'published_xc', (SELECT count(DISTINCT user_id) FROM product_events WHERE user_id = ANY(ru) AND event = 'post_published')
    ),
    'drafts', jsonb_build_object(
      'content_items', (SELECT count(*) FROM content_items WHERE user_id = ANY(ru) AND status = 'draft'),
      'linkedin_posts', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status = 'draft' AND source_type IN ('aura_generated','carousel_studio')),
      'linkedin_posts_all_rows', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru)),
      'oldest_days', (SELECT floor(EXTRACT(epoch FROM now() - min(c))/86400)::int FROM (
          SELECT min(created_at) c FROM content_items WHERE user_id = ANY(ru) AND status='draft'
          UNION ALL
          SELECT min(created_at) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='draft' AND source_type IN ('aura_generated','carousel_studio')
        ) x),
      'list', coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY (l.age_days) DESC) FROM (
          SELECT ci.id::text AS id, 'content_items' AS source, ci.user_id::text AS user_id,
                 coalesce(dp.first_name, 'Someone') AS first_name,
                 coalesce(nullif(ci.title,''), left(coalesce(ci.body,''),60)) AS title,
                 floor(EXTRACT(epoch FROM now()-ci.created_at)/86400)::int AS age_days
            FROM content_items ci LEFT JOIN diagnostic_profiles dp ON dp.user_id = ci.user_id
           WHERE ci.user_id = ANY(ru) AND ci.status='draft'
          UNION ALL
          SELECT lp.id::text, 'linkedin_posts', lp.user_id::text,
                 coalesce(dp.first_name,'Someone'),
                 left(coalesce(nullif(lp.title,''), lp.post_text, lp.hook, ''),60),
                 floor(EXTRACT(epoch FROM now()-lp.created_at)/86400)::int
            FROM linkedin_posts lp LEFT JOIN diagnostic_profiles dp ON dp.user_id = lp.user_id
           WHERE lp.user_id = ANY(ru) AND lp.tracking_status='draft'
             AND lp.source_type IN ('aura_generated','carousel_studio')
        ) l), '[]'::jsonb)
    ),
    'content', jsonb_build_object(
      'published_total', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='published'),
      'published_30d', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='published' AND coalesce(published_at, created_at) > now()-interval '30 days'),
      'failed_total', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='failed')
    ),
    'signals', jsonb_build_object(
      'live', (SELECT count(*) FROM strategic_signals WHERE user_id = ANY(ru) AND coalesce(status,'active')='active'),
      'created_7d', (SELECT count(*) FROM strategic_signals WHERE user_id = ANY(ru) AND created_at > now()-interval '7 days'),
      'stale_30d', (SELECT count(*) FROM strategic_signals WHERE user_id = ANY(ru) AND coalesce(status,'active')='active' AND created_at < now()-interval '30 days')
    ),
    'failed_publishes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'first_name', coalesce(dp.first_name,'Someone'),
        'user_id', lp.user_id::text,
        'post_id', lp.id::text,
        'date', to_char(lp.created_at,'DD Mon HH24:MI'),
        'error', coalesce(lp.source_metadata->>'publish_error','no error recorded')
      ) ORDER BY lp.created_at DESC)
      FROM linkedin_posts lp LEFT JOIN diagnostic_profiles dp ON dp.user_id = lp.user_id
      WHERE lp.user_id = ANY(ru) AND lp.tracking_status = 'failed'
        AND coalesce(lp.content_type,'') <> 'aura_card'
        AND coalesce(lp.source_metadata->>'origin','') <> 'aura_card'
        AND lp.source_metadata->>'publish_correlation_id' IS NOT NULL
        AND lp.publish_attempted_at IS DISTINCT FROM lp.created_at), '[]'::jsonb),
    'signal_reads', jsonb_build_object(
      'engagements', (SELECT count(*) FROM signal_engagements WHERE user_id = ANY(ru)),
      'product_event_rows', (SELECT count(*) FROM product_events WHERE user_id = ANY(ru) AND event ILIKE '%signal%' AND (event ILIKE '%open%' OR event ILIKE '%view%')),
      'product_event_exists', (SELECT EXISTS(SELECT 1 FROM product_events WHERE event ILIKE '%signal%' AND (event ILIKE '%open%' OR event ILIKE '%view%')))
    ),
    'grid', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'd', to_char(g.day,'DD'),
        'captures', (SELECT count(*) FROM entries e WHERE e.user_id = ANY(ru) AND e.created_at::date = g.day),
        'signals', (SELECT count(*) FROM strategic_signals s WHERE s.user_id = ANY(ru) AND s.created_at::date = g.day),
        'composer', (SELECT count(*) FROM product_events p WHERE p.user_id = ANY(ru) AND p.event='composer_opened' AND p.occurred_at::date = g.day),
        'published', (SELECT count(*) FROM linkedin_posts l WHERE l.user_id = ANY(ru) AND l.tracking_status='published' AND coalesce(l.published_at, l.created_at)::date = g.day)
      ) ORDER BY g.day) FROM generate_series((now()::date - 13), now()::date, '1 day') g(day)), '[]'::jsonb),
    'people', coalesce((SELECT jsonb_agg(p ORDER BY p->>'first_name') FROM (
        SELECT jsonb_build_object(
          'user_id', u.id::text,
          'email', u.email,
          'first_name', coalesce(dp.first_name, split_part(u.email,'@',1)),
          'captures', (SELECT count(*) FROM entries e WHERE e.user_id = u.id),
          'signals', (SELECT count(*) FROM strategic_signals s WHERE s.user_id = u.id),
          'drafts', (SELECT count(*) FROM content_items ci WHERE ci.user_id=u.id AND ci.status='draft')
                    + (SELECT count(*) FROM linkedin_posts lp WHERE lp.user_id=u.id AND lp.tracking_status='draft' AND lp.source_type IN ('aura_generated','carousel_studio')),
          'linkedin', CASE
            WHEN EXISTS(SELECT 1 FROM linkedin_connections lc WHERE lc.user_id=u.id AND lc.status='active') THEN 'live'
            WHEN EXISTS(SELECT 1 FROM linkedin_connections lc WHERE lc.user_id=u.id) THEN 'dropped'
            ELSE 'never' END,
          'days_since_capture', (SELECT floor(EXTRACT(epoch FROM now()-max(e.created_at))/86400)::int FROM entries e WHERE e.user_id=u.id),
          'published', (SELECT count(*) FROM linkedin_posts lp WHERE lp.user_id=u.id AND lp.tracking_status='published'),
          'stages', jsonb_build_object(
            'signed_in', (u.last_sign_in_at IS NOT NULL),
            'finished_setup', EXISTS(SELECT 1 FROM diagnostic_profiles d2 WHERE d2.user_id=u.id),
            'captured', EXISTS(SELECT 1 FROM entries e2 WHERE e2.user_id=u.id),
            'got_signal', EXISTS(SELECT 1 FROM strategic_signals s2 WHERE s2.user_id=u.id),
            'linkedin_live', EXISTS(SELECT 1 FROM linkedin_connections l2 WHERE l2.user_id=u.id AND l2.status='active'),
            'opened_writer', EXISTS(SELECT 1 FROM product_events p2 WHERE p2.user_id=u.id AND p2.event='composer_opened'),
            'has_draft', (EXISTS(SELECT 1 FROM content_items c2 WHERE c2.user_id=u.id AND c2.status='draft')
                          OR EXISTS(SELECT 1 FROM linkedin_posts l3 WHERE l3.user_id=u.id AND l3.tracking_status='draft' AND l3.source_type IN ('aura_generated','carousel_studio'))),
            'published', EXISTS(SELECT 1 FROM linkedin_posts l4 WHERE l4.user_id=u.id AND l4.tracking_status='published')
          )
        ) AS p
        FROM auth.users u LEFT JOIN diagnostic_profiles dp ON dp.user_id = u.id
        WHERE u.id = ANY(ru)
      ) q), '[]'::jsonb)
  ) INTO out;

  RETURN out;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.founder_brief_user_ids()
 RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT u.id, u.email::text, u.last_sign_in_at, u.created_at
  FROM auth.users u
  WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
    AND coalesce(u.email, '') NOT ILIKE '%test%'
$function$
;

CREATE OR REPLACE FUNCTION public.founder_brief_verify()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  excluded uuid[] := ARRAY(SELECT e.user_id FROM public.excluded_user_ids() e);
  ru uuid[];
  res jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT array_agg(id) INTO ru FROM auth.users u
   WHERE u.id <> ALL(excluded) AND coalesce(u.email,'') NOT ILIKE '%test%';
  ru := coalesce(ru, ARRAY[]::uuid[]);

  -- Route C: every number re-derived per user with EXISTS, then summed.
  SELECT jsonb_build_object(
    'checked_at', now(),
    'invited', (SELECT count(*) FROM auth.users u WHERE u.id = ANY(ru)),
    'signed_in', (SELECT count(*) FROM auth.users u WHERE u.id = ANY(ru) AND u.last_sign_in_at IS NOT NULL),
    'finished_setup', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM diagnostic_profiles d WHERE d.user_id = x)),
    'captured', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM entries e WHERE e.user_id = x)),
    'got_signal', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM strategic_signals s WHERE s.user_id = x)),
    'linkedin_live', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM linkedin_connections l WHERE l.user_id = x AND l.status='active')),
    'opened_writer', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM product_events p WHERE p.user_id = x AND p.event='composer_opened')),
    'has_draft', (SELECT count(*) FROM unnest(ru) x WHERE
        EXISTS(SELECT 1 FROM content_items c WHERE c.user_id = x AND c.status='draft')
        OR EXISTS(SELECT 1 FROM linkedin_posts l WHERE l.user_id = x AND l.tracking_status='draft' AND l.source_type IN ('aura_generated','carousel_studio'))),
    'published', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM linkedin_posts l WHERE l.user_id = x AND l.tracking_status='published')),
    'drafts_total', (SELECT (SELECT count(*) FROM content_items c WHERE c.user_id = ANY(ru) AND c.status='draft')
                          + (SELECT count(*) FROM linkedin_posts l WHERE l.user_id = ANY(ru) AND l.tracking_status='draft' AND l.source_type IN ('aura_generated','carousel_studio'))),
    'failed_publishes', (SELECT count(*) FROM linkedin_posts l WHERE l.user_id = ANY(ru) AND l.tracking_status='failed'),
    'signal_engagement_rows', (SELECT count(*) FROM signal_engagements WHERE user_id = ANY(ru))
  ) INTO res;

  RETURN res;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.founding_reservations()
 RETURNS TABLE(claimed integer, cap integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::integer FROM public.beta_allowlist WHERE ref LIKE 'reserve\_69%') AS claimed,
    50::integer AS cap;
$function$
;

CREATE OR REPLACE FUNCTION public.founding_seats()
 RETURNS TABLE(claimed integer, cap integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::integer FROM public.beta_allowlist WHERE status IN ('invited','active')) AS claimed,
    50::integer AS cap;
$function$
;

CREATE OR REPLACE FUNCTION public.get_assessment_session(p_token text)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, expires_at timestamp with time zone, runs_started integer, state jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.assessment_sessions s set last_seen_at = now()
    where s.token = p_token and s.user_id is null and s.expires_at > now();
  return query
    select s.id, s.created_at, s.expires_at, s.runs_started, s.state
    from public.assessment_sessions s
    where s.token = p_token and s.user_id is null and s.expires_at > now();
end $function$
;

CREATE OR REPLACE FUNCTION public.get_run_stages(p_run_id uuid, p_anon_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'stages', r.stages,
           'outcome', r.outcome,
           'reason_code', r.reason_code,
           'finished_at', r.finished_at
         )
  FROM public.operation_runs r
  WHERE r.id = p_run_id
    AND (
      (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
      OR (p_anon_token IS NOT NULL AND r.anon_token = p_anon_token)
    )
$function$
;

CREATE OR REPLACE FUNCTION public.get_shared_read(p_token text)
 RETURNS TABLE(headline text, archetype text, market_read text, subjects jsonb, own_words text, lang text, display_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A revoked share is gone. Nothing else about the member is ever exposed.
  update public.report_shares
     set views = views + 1
   where token = p_token and revoked_at is null;

  return query
  select s.headline, s.archetype, s.market_read, s.subjects,
         s.own_words, s.lang, s.display_name
    from public.report_shares s
   where s.token = p_token and s.revoked_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.grant_member_role_on_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'member'::app_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_account_type_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.account_type IS DISTINCT FROM OLD.account_type
      OR NEW.excluded_reason IS DISTINCT FROM OLD.excluded_reason
      OR NEW.excluded_at IS DISTINCT FROM OLD.excluded_at)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change account_type, excluded_reason or excluded_at';
  END IF;

  IF (NEW.plan IS DISTINCT FROM OLD.plan
      OR NEW.tier IS DISTINCT FROM OLD.tier
      OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
      OR NEW.plan_started_at IS DISTINCT FROM OLD.plan_started_at)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change plan, tier, trial_ends_at or plan_started_at';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if current_user = 'service_role' or auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  new.plan := old.plan;
  new.tier := old.tier;
  new.account_type := old.account_type;
  new.trial_ends_at := old.trial_ends_at;
  new.plan_source := old.plan_source;
  new.excluded_reason := old.excluded_reason;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$function$
;

CREATE OR REPLACE FUNCTION public.home_record_themes(p_from date, p_to date, p_uid uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'UTC'::text)
 RETURNS TABLE(id uuid, title text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.signal_title, s.created_at
  FROM public.strategic_signals s
  WHERE s.user_id = COALESCE(p_uid, auth.uid())
    AND (COALESCE(p_uid, auth.uid()) = auth.uid() OR public.is_current_user_admin())
    AND s.status IN ('active','dormant')
    AND (s.created_at AT TIME ZONE p_tz)::date >= p_from
    AND (s.created_at AT TIME ZONE p_tz)::date <= p_to
  ORDER BY s.created_at DESC
  LIMIT 10;
$function$
;

CREATE OR REPLACE FUNCTION public.home_record_timeline(p_uid uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'UTC'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_uid, auth.uid());
  v_tz  text := COALESCE(NULLIF(p_tz,''), 'UTC');
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  PERFORM set_config('timezone', v_tz, true);

  WITH pp AS (SELECT * FROM public.post_provenance WHERE user_id = v_uid),
  ev AS (
    -- 'cap' is only what the member saved. Articles Aura fetched for the
    -- overnight read are counted separately as 'found' so nothing is lost.
    SELECT (created_at AT TIME ZONE v_tz)::date AS d,
           CASE WHEN COALESCE(source_type,'user') = 'aura_agent' THEN 'found' ELSE 'cap' END::text AS k
      FROM public.entries WHERE user_id = v_uid
    UNION ALL
    SELECT (created_at AT TIME ZONE v_tz)::date, 'theme' FROM public.strategic_signals
      WHERE user_id = v_uid AND status IN ('active','dormant')
    UNION ALL
    SELECT (at AT TIME ZONE v_tz)::date, 'draft' FROM public.post_events
      WHERE user_id = v_uid AND event = 'drafted' AND actor = 'aura'
    UNION ALL
    SELECT (at AT TIME ZONE v_tz)::date, 'pub' FROM public.post_events
      WHERE user_id = v_uid AND event = 'published'
    UNION ALL
    SELECT (created_at AT TIME ZONE v_tz)::date, 'night' FROM public.agent_findings WHERE user_id = v_uid
  ),
  agg AS (
    SELECT d,
      COUNT(*) FILTER (WHERE k='cap')::int cap, COUNT(*) FILTER (WHERE k='found')::int found,
      COUNT(*) FILTER (WHERE k='theme')::int themes,
      COUNT(*) FILTER (WHERE k='draft')::int drafts, COUNT(*) FILTER (WHERE k='pub')::int pub,
      COUNT(*) FILTER (WHERE k='night')::int nights
    FROM ev GROUP BY d
  ),
  span AS (SELECT COALESCE(MIN(d), CURRENT_DATE) lo, CURRENT_DATE hi FROM agg),
  mser AS (
    SELECT generate_series(date_trunc('month',(SELECT lo FROM span)), date_trunc('month',(SELECT hi FROM span)), '1 month')::date AS m
  ),
  days AS (
    SELECT jsonb_agg(jsonb_build_object('d',d,'cap',cap,'found',found,'themes',themes,'drafts',drafts,'pub',pub,'nights',nights) ORDER BY d DESC) j
    FROM agg WHERE d >= (CURRENT_DATE - 45)
  ),
  weeks AS (
    SELECT jsonb_agg(x ORDER BY (x->>'d') DESC) j FROM (
      SELECT jsonb_build_object('d',date_trunc('week',d)::date,'cap',SUM(cap)::int,'found',SUM(found)::int,'themes',SUM(themes)::int,
        'drafts',SUM(drafts)::int,'pub',SUM(pub)::int,'nights',SUM(nights)::int) x
      FROM agg WHERE d >= (CURRENT_DATE - 400) GROUP BY date_trunc('week',d)) w
  ),
  months AS (
    SELECT jsonb_agg(x ORDER BY (x->>'d') DESC) j FROM (
      SELECT jsonb_build_object('d',mser.m,'cap',COALESCE(SUM(a.cap),0)::int,'found',COALESCE(SUM(a.found),0)::int,'themes',COALESCE(SUM(a.themes),0)::int,
        'drafts',COALESCE(SUM(a.drafts),0)::int,'pub',COALESCE(SUM(a.pub),0)::int,'nights',COALESCE(SUM(a.nights),0)::int) x
      FROM mser LEFT JOIN agg a ON date_trunc('month',a.d)::date = mser.m
      GROUP BY mser.m) m
  ),
  pubs AS (
    SELECT jsonb_agg(jsonb_build_object('id',id,'at',COALESCE(published_at,created_at),
      'title',NULLIF(TRIM(COALESCE(NULLIF(TRIM(title),''),NULLIF(TRIM(hook),''),LEFT(COALESCE(post_text,''),160))),''),
      'provenance',provenance,'through_aura',(provenance IN ('aura_published','aura_drafted'))) ORDER BY COALESCE(published_at,created_at) DESC) j
    FROM (SELECT * FROM pp ORDER BY COALESCE(published_at,created_at) DESC LIMIT 200) q
  ),
  snaps AS (SELECT tier, created_at, LAG(tier) OVER (ORDER BY created_at) prev_tier
            FROM public.imprint_snapshots WHERE user_id=v_uid AND tier IS NOT NULL),
  bands AS (
    SELECT jsonb_agg(jsonb_build_object('at',created_at,'kind','band','value',tier,
      'direction', CASE WHEN public.tier_rank(tier) > public.tier_rank(prev_tier) THEN 'up' ELSE 'down' END) ORDER BY created_at) j
    FROM snaps WHERE prev_tier IS NOT NULL AND tier <> prev_tier
  ),
  first_pub AS (
    SELECT jsonb_build_object('at',COALESCE(published_at,created_at),'kind','first_publish',
      'value',NULLIF(TRIM(COALESCE(NULLIF(TRIM(title),''),NULLIF(TRIM(hook),''),LEFT(COALESCE(post_text,''),160))),''),
      'through_aura',(provenance IN ('aura_published','aura_drafted'))) j
    FROM pp WHERE provenance IN ('aura_published','aura_drafted')
    ORDER BY COALESCE(published_at,created_at) ASC LIMIT 1
  ),
  sig_frag AS (
    SELECT s.id, s.signal_title, f.created_at,
           ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY f.created_at) rn
    FROM public.strategic_signals s
    CROSS JOIN LATERAL unnest(COALESCE(s.supporting_evidence_ids, ARRAY[]::uuid[])) ev_id
    JOIN public.evidence_fragments f ON f.id = ev_id
    WHERE s.user_id = v_uid AND COALESCE(s.fragment_count,0) >= 25
  ),
  frag_marks AS (
    SELECT jsonb_agg(x ORDER BY (x->>'at')) j FROM (
      SELECT DISTINCT ON (t.n) jsonb_build_object('at',sf.created_at,'kind','fragments','value',sf.signal_title,'n',t.n) x
      FROM (SELECT 25 n UNION ALL SELECT 50) t JOIN sig_frag sf ON sf.rn = t.n
      ORDER BY t.n, sf.created_at ASC) q
  ),
  profile AS (SELECT created_at FROM public.diagnostic_profiles WHERE user_id=v_uid LIMIT 1)
  SELECT jsonb_build_object(
    'days',COALESCE((SELECT j FROM days),'[]'::jsonb),
    'weeks',COALESCE((SELECT j FROM weeks),'[]'::jsonb),
    'months',COALESCE((SELECT j FROM months),'[]'::jsonb),
    'published',COALESCE((SELECT j FROM pubs),'[]'::jsonb),
    'milestones',COALESCE((SELECT j FROM bands),'[]'::jsonb)
      || COALESCE((SELECT jsonb_build_array(j) FROM first_pub),'[]'::jsonb)
      || COALESCE((SELECT j FROM frag_marks),'[]'::jsonb),
    'signup_at',(SELECT created_at FROM profile),
    'tz', v_tz,
    'published_total',(SELECT COUNT(*) FROM pp),
    'published_returned',(SELECT COUNT(*) FROM (SELECT 1 FROM pp LIMIT 200) z),
    'published_through_aura',(SELECT COUNT(*) FROM pp WHERE provenance IN ('aura_published','aura_drafted')),
    'published_sent_from_aura',(SELECT COUNT(*) FROM pp WHERE provenance='aura_published'),
    'fragments_total',(SELECT COUNT(*) FROM public.evidence_fragments WHERE user_id=v_uid),
    'themes_total',(SELECT COUNT(*) FROM public.strategic_signals WHERE user_id=v_uid AND status IN ('active','dormant')),
    'captures_total',(SELECT COUNT(*) FROM public.entries WHERE user_id=v_uid AND COALESCE(source_type,'user') <> 'aura_agent'),
    'found_total',(SELECT COUNT(*) FROM public.entries WHERE user_id=v_uid AND source_type = 'aura_agent')
  ) INTO v_result;
  RETURN v_result;
END; $function$
;

CREATE OR REPLACE FUNCTION public.identity_kind(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT kind FROM public.identity_registry WHERE user_id = p_user_id LIMIT 1), 'unknown');
$function$
;

CREATE OR REPLACE FUNCTION public.increment_voice_rule_applied(p_rule_id uuid, p_applied_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.voice_rules
  SET times_applied = times_applied + 1,
      last_applied_at = p_applied_at
  WHERE id = p_rule_id;
$function$
;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.is_customer(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.identity_kind(p_user_id) = 'customer';
$function$
;

CREATE OR REPLACE FUNCTION public.join_read_queue(p_email text, p_operation text DEFAULT 'linkedin_read'::text, p_anon_token text DEFAULT NULL::text, p_fingerprint_hash text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_pos integer;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;

  SELECT id INTO v_id FROM public.read_queue
   WHERE lower(email) = lower(p_email) AND notified_at IS NULL
   ORDER BY requested_at LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.read_queue (email, operation, anon_token, fingerprint_hash)
    VALUES (lower(p_email), coalesce(p_operation, 'linkedin_read'), p_anon_token, p_fingerprint_hash)
    RETURNING id INTO v_id;
  END IF;

  SELECT count(*) INTO v_pos
    FROM public.read_queue q
   WHERE q.notified_at IS NULL
     AND q.requested_at <= (SELECT requested_at FROM public.read_queue WHERE id = v_id);

  RETURN v_pos;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.learned_intelligence_tsv_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.linkedin_handle_valid(h text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select h is not null and h ~ '^[a-z0-9]([a-z0-9-]{1,98})[a-z0-9]$';
$function$
;

CREATE OR REPLACE FUNCTION public.linkedin_posts_tsv_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.hook, '') || ' ' || coalesce(NEW.post_text, ''));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.momentum_funnel()
 RETURNS TABLE(captures integer, used_in_signal integer, signals integer, published integer, published_through_aura integer, published_live integer, published_sent_from_aura integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pp AS (
    SELECT provenance FROM public.post_provenance WHERE user_id = auth.uid()
  ),
  aura AS (SELECT count(*)::int AS n FROM pp WHERE provenance IN ('aura_published','aura_drafted')),
  sent AS (SELECT count(*)::int AS n FROM pp WHERE provenance = 'aura_published'),
  live AS (SELECT count(*)::int AS n FROM pp)
  SELECT
    (SELECT count(*)::int FROM public.entries e WHERE e.user_id = auth.uid()),
    (SELECT count(DISTINCT e.id)::int FROM public.entries e
      WHERE e.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.source_registry sr
          JOIN public.evidence_fragments ef ON ef.source_registry_id = sr.id
          JOIN public.strategic_signals s ON ef.id = ANY(s.supporting_evidence_ids)
          WHERE sr.source_id = e.id AND s.user_id = auth.uid()
        )),
    (SELECT count(*)::int FROM public.strategic_signals s
      WHERE s.user_id = auth.uid() AND s.status IN ('active','dormant')),
    (SELECT n FROM aura),
    (SELECT n FROM aura),
    (SELECT n FROM live),
    (SELECT n FROM sent)
$function$
;

CREATE OR REPLACE FUNCTION public.normalise_linkedin_handle(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(
    lower(
      trim(both '/' from
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(p_raw, ''), '^\s*@+', ''),
            '^\s*(https?://)?([a-z0-9-]+\.)*linkedin\.com/in/', '', 'i'
          ),
          '[/?#].*$', ''
        )
      )
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.notify_first_signal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lang text;
  v_title text;
  v_body text;
  v_exists boolean;
BEGIN
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = NEW.user_id
        AND metadata->>'kind' = 'first_signal_aha'
    ) INTO v_exists;

    IF v_exists THEN RETURN NEW; END IF;

    SELECT COALESCE(NULLIF(content_language, ''), 'en')
      INTO v_lang
      FROM public.diagnostic_profiles
     WHERE user_id = NEW.user_id
     LIMIT 1;

    v_lang := COALESCE(v_lang, 'en');

    IF v_lang = 'ar' THEN
      v_title := 'أول إشارة لك ظهرت ✦';
      v_body  := 'وجدت Aura نمطاً في قراءاتك: «' || COALESCE(NEW.signal_title,'') ||
                 '». حوّلها إلى منشور بصوتك — اضغط لعرضها.';
    ELSE
      v_title := 'Your first signal is live ✦';
      v_body  := 'Aura found a pattern in your reading: "' || COALESCE(NEW.signal_title,'') ||
                 '". Turn it into a post in your voice — tap to see it.';
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (
      NEW.user_id, 'momentum', v_title, v_body,
      jsonb_build_object(
        'kind','first_signal_aha',
        'signal_id', NEW.id,
        'signal_title', NEW.signal_title,
        'cta','/dashboard?tab=intelligence'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_first_signal skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_cron_status(p_hours integer DEFAULT 24)
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_end timestamp with time zone, last_status text, succeeded_24h integer, failed_24h integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  WITH recent AS (
    SELECT d.jobid, d.status, d.end_time, d.start_time
    FROM cron.job_run_details d
    WHERE d.end_time > now() - interval '8 days'
  ),
  agg AS (
    SELECT jobid,
      SUM(CASE WHEN status='succeeded' AND end_time > now() - (p_hours || ' hours')::interval THEN 1 ELSE 0 END)::int AS s24,
      SUM(CASE WHEN status='failed'    AND end_time > now() - (p_hours || ' hours')::interval THEN 1 ELSE 0 END)::int AS f24
    FROM recent GROUP BY jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (jobid) jobid, end_time, status
    FROM recent
    ORDER BY jobid, end_time DESC
  )
  SELECT j.jobid, j.jobname, j.schedule, j.active,
         l.end_time, l.status,
         COALESCE(a.s24,0), COALESCE(a.f24,0)
  FROM cron.job j
  LEFT JOIN last_run l ON l.jobid = j.jobid
  LEFT JOIN agg a ON a.jobid = j.jobid
  WHERE j.active = true
  ORDER BY j.jobname;
$function$
;

CREATE OR REPLACE FUNCTION public.ops_health_findings_summary(p_hours integer DEFAULT 24)
 RETURNS TABLE(open_count integer, newest_title text, newest_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT COUNT(*)::int FROM public.health_findings
      WHERE resolved_at IS NULL AND last_seen > now() - (p_hours || ' hours')::interval),
    (SELECT code FROM public.health_findings
      WHERE resolved_at IS NULL
      ORDER BY last_seen DESC LIMIT 1),
    (SELECT last_seen FROM public.health_findings
      WHERE resolved_at IS NULL
      ORDER BY last_seen DESC LIMIT 1);
$function$
;

CREATE OR REPLACE FUNCTION public.pending_capture_entries(p_limit integer DEFAULT 25, p_min_age_minutes integer DEFAULT 10, p_max_attempts integer DEFAULT 3)
 RETURNS TABLE(id uuid, user_id uuid, extract_attempts integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.user_id, e.extract_attempts
  FROM public.entries e
  WHERE e.created_at < now() - (p_min_age_minutes || ' minutes')::interval
    AND e.extract_attempts < p_max_attempts
    AND NOT EXISTS (
      SELECT 1 FROM public.source_registry sr
      WHERE sr.source_type = 'entry'
        AND sr.source_id = e.id
        AND sr.processed = true
    )
  ORDER BY e.created_at ASC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.posts_attribution()
 RETURNS TABLE(total bigint, member bigint, aura bigint, machine bigint, unknown bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A report must never make "you may not ask" look like "everything is zero".
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    count(*) FILTER (WHERE made_by IN ('member','aura_edited_by_member')),
    count(*) FILTER (WHERE made_by = 'aura'),
    count(*) FILTER (WHERE made_by = 'machine'),
    count(*) FILTER (WHERE made_by = 'unknown')
  FROM public.linkedin_posts;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_invariants()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  unclassified_all as (
    select id from linkedin_posts
    where published_at is not null
      and (authorship is null or authorship not in ('aura_drafted','aura_assisted','user_written','unknown'))
  ),
  stuck_all as (
    select id from linkedin_posts
    where tracking_status = 'publishing'
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
  ),
  twins_all as (
    select ci.id from content_items ci
    where ci.status = 'draft'
      and exists (
        select 1 from linkedin_posts lp
        where lp.user_id = ci.user_id
          and lp.published_at is not null
          and lp.post_text = ci.body
      )
  ),
  stale_review_all as (
    select id from linkedin_posts
    where tracking_status = 'needs_review'
      and coalesce(claimed_at, created_at) < now() - interval '7 days'
  )
  select jsonb_build_object(
    'checked_at', now(),
    'unclassified', jsonb_build_object(
      'count', (select count(*) from unclassified_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from unclassified_all limit 50) s), '[]'::jsonb)
    ),
    'stuck_publishing', jsonb_build_object(
      'count', (select count(*) from stuck_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from stuck_all limit 50) s), '[]'::jsonb)
    ),
    'published_draft_twins', jsonb_build_object(
      'count', (select count(*) from twins_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from twins_all limit 50) s), '[]'::jsonb)
    ),
    'stale_needs_review', jsonb_build_object(
      'count', (select count(*) from stale_review_all),
      'samples', coalesce((select jsonb_agg(id) from (select id from stale_review_all limit 50) s), '[]'::jsonb)
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.purge_expired_assessment_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v int;
begin
  delete from public.assessment_sessions
   where user_id is null and expires_at < now();
  get diagnostics v = row_count;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.qa_cron_success_jobs(p_hours integer)
 RETURNS TABLE(jobname text, runs integer, last_end timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT j.jobname,
         count(*)::int AS runs,
         max(d.end_time) AS last_end
  FROM cron.job j
  JOIN cron.job_run_details d ON d.jobid = j.jobid
  WHERE d.status = 'succeeded'
    AND d.end_time > now() - make_interval(hours => p_hours)
  GROUP BY j.jobname
$function$
;

CREATE OR REPLACE FUNCTION public.recent_cron_http_failures(p_minutes integer DEFAULT 90)
 RETURNS TABLE(status_code integer, failures bigint, sample_error text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
  SELECT
    r.status_code::int AS status_code,
    COUNT(*)::bigint AS failures,
    (ARRAY_AGG(COALESCE(NULLIF(r.error_msg,''), LEFT(r.content,300)) ORDER BY r.created DESC))[1] AS sample_error
  FROM net._http_response r
  WHERE r.created > now() - (p_minutes || ' minutes')::interval
    AND (
      r.status_code >= 400
      OR (r.status_code IS NULL AND COALESCE(r.timed_out, false) = false)
    )
  GROUP BY r.status_code
  ORDER BY failures DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_signal_counts()
 RETURNS TABLE(signals_checked integer, signals_fixed integer, dead_ids_pruned integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_checked int := 0;
  v_fixed   int := 0;
  v_pruned  int := 0;
  r record;
  v_pruned_ids uuid[];
  v_dead int;
  v_new_frag_count int;
  v_new_unique_orgs int;
BEGIN
  FOR r IN
    SELECT id, supporting_evidence_ids, fragment_count, unique_orgs
    FROM public.strategic_signals
  LOOP
    v_checked := v_checked + 1;

    SELECT COALESCE(array_agg(f.id), ARRAY[]::uuid[])
      INTO v_pruned_ids
    FROM public.evidence_fragments f
    WHERE f.id = ANY(COALESCE(r.supporting_evidence_ids, ARRAY[]::uuid[]));

    v_dead := COALESCE(array_length(r.supporting_evidence_ids,1),0)
            - COALESCE(array_length(v_pruned_ids,1),0);
    v_pruned := v_pruned + GREATEST(v_dead, 0);

    v_new_frag_count := COALESCE(array_length(v_pruned_ids,1),0);

    SELECT COUNT(DISTINCT COALESCE(sr.source_id::text, sr.id::text))
      INTO v_new_unique_orgs
    FROM public.evidence_fragments f
    JOIN public.source_registry sr ON sr.id = f.source_registry_id
    WHERE f.id = ANY(v_pruned_ids);

    v_new_unique_orgs := COALESCE(v_new_unique_orgs, 0);

    IF v_dead > 0
       OR COALESCE(r.fragment_count,0) <> v_new_frag_count
       OR COALESCE(r.unique_orgs,0)    <> v_new_unique_orgs THEN
      UPDATE public.strategic_signals
      SET supporting_evidence_ids = v_pruned_ids,
          fragment_count = v_new_frag_count,
          unique_orgs    = v_new_unique_orgs,
          updated_at     = now()
      WHERE id = r.id;
      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  -- Telemetry heartbeat. severity=info => NOT a fault (see view public.ef_faults).
  -- Wrapped: a logging failure must NEVER roll back the reconciliation above.
  BEGIN
    INSERT INTO public.ef_error_log (function_name, severity, error_message, context)
    VALUES (
      'reconcile-signal-counts',
      'info',
      'SIGNAL_COUNT_RECONCILE',
      jsonb_build_object(
        'signals_checked', v_checked,
        'signals_fixed',   v_fixed,
        'dead_ids_pruned', v_pruned,
        'ran_at',          now()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reconcile_signal_counts telemetry write failed: %', SQLERRM;
  END;

  RETURN QUERY SELECT v_checked, v_fixed, v_pruned;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_brief_run(p_brief_date date, p_payload jsonb, p_audit jsonb, p_is_sent boolean, p_run_reason text, p_rendered_html text)
 RETURNS TABLE(id uuid, run_seq integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq int;
BEGIN
  SELECT coalesce(max(s.run_seq), 0) + 1 INTO v_seq
  FROM public.daily_brief_snapshots s WHERE s.brief_date = p_brief_date;

  RETURN QUERY
  INSERT INTO public.daily_brief_snapshots
    (brief_date, payload, audit, run_seq, is_sent, run_reason, rendered_html)
  VALUES
    (p_brief_date, coalesce(p_payload,'{}'::jsonb), coalesce(p_audit,'{}'::jsonb),
     v_seq, coalesce(p_is_sent,false), p_run_reason, p_rendered_html)
  RETURNING daily_brief_snapshots.id, daily_brief_snapshots.run_seq;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_guide_miss(_slug text, _surface text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _slug IS NULL OR length(_slug) = 0 OR length(_slug) > 200 THEN RETURN; END IF;
  IF _surface NOT IN ('tooltip','hint') THEN RETURN; END IF;
  INSERT INTO public.guide_slug_misses (slug, surface, count, first_seen, last_seen)
  VALUES (_slug, _surface, 1, now(), now())
  ON CONFLICT (slug, surface)
  DO UPDATE SET count = public.guide_slug_misses.count + 1, last_seen = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_post_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actor text;
begin
  v_actor := case when NEW.authorship in ('aura_drafted','aura_assisted') then 'aura'
                  when NEW.authorship = 'user_written' then 'member' else 'system' end;
  if TG_OP = 'INSERT' then
    insert into public.post_events(post_id,user_id,event,at,actor,details)
    values (NEW.id, NEW.user_id, 'drafted', coalesce(NEW.created_at, now()), v_actor,
            jsonb_build_object('source_type',NEW.source_type,'authorship',NEW.authorship))
    on conflict do nothing;
    if NEW.published_at is not null then
      insert into public.post_events(post_id,user_id,event,at,actor,details)
      values (NEW.id, NEW.user_id, 'published', NEW.published_at,
              case when NEW.acquisition='published_via_aura' then 'aura'
                   when NEW.acquisition in ('imported','discovered','api_synced') then 'linkedin'
                   else 'member' end,
              jsonb_build_object('acquisition',NEW.acquisition))
      on conflict do nothing;
    end if;
    return NEW;
  end if;
  if OLD.publish_attempted_at is null and NEW.publish_attempted_at is not null then
    insert into public.post_events(post_id,user_id,event,at,actor,details)
    values (NEW.id,NEW.user_id,'publish_attempted',NEW.publish_attempted_at,'aura','{}'::jsonb) on conflict do nothing;
  end if;
  if OLD.published_at is null and NEW.published_at is not null then
    insert into public.post_events(post_id,user_id,event,at,actor,details)
    values (NEW.id,NEW.user_id,'published',NEW.published_at,
            case when NEW.acquisition='published_via_aura' or NEW.publish_attempted_at is not null then 'aura'
                 when NEW.acquisition in ('imported','discovered','api_synced') then 'linkedin' else 'member' end,
            jsonb_build_object('acquisition',NEW.acquisition)) on conflict do nothing;
  end if;
  if OLD.tracking_status is distinct from NEW.tracking_status and NEW.tracking_status in ('rejected','discarded') then
    insert into public.post_events(post_id,user_id,event,at,actor,details)
    values (NEW.id,NEW.user_id,'discarded',now(),'member',
            jsonb_build_object('reason',NEW.rejection_reason)) on conflict do nothing;
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.reject_stopword_alias()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  stopwords text[] := ARRAY['of','the','and','for','in','to','a','an','on','with','it','is','at','by','as','or','from','that','this','be'];
BEGIN
  IF lower(btrim(NEW.alias)) = ANY (stopwords) THEN
    RAISE EXCEPTION 'alias "%" is a stopword and would match every profile', NEW.alias;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.report_invariants()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with started as (
    select
      user_id,
      (select count(*) from jsonb_object_keys(coalesce(brand_assessment_answers::jsonb, '{}'::jsonb))) as answer_keys,
      brand_assessment_results,
      brand_assessment_completed_at
    from public.diagnostic_profiles
  ),
  norm as (
    select
      user_id,
      answer_keys,
      brand_assessment_completed_at,
      case
        when brand_assessment_results is null then -1
        when jsonb_typeof(brand_assessment_results::jsonb) <> 'object' then -1
        else (select count(*) from jsonb_object_keys(brand_assessment_results::jsonb))::int
      end as result_keys
    from started
  ),
  answers_no_results as (
    select user_id from norm where answer_keys > 0 and result_keys <= 0
  ),
  empty_results as (
    -- results present as an object but empty, for someone who actually started
    select user_id from norm
    where result_keys = 0
      and (answer_keys > 0 or brand_assessment_completed_at is not null)
  ),
  completed_no_results as (
    select user_id from norm
    where brand_assessment_completed_at is not null and result_keys <= 0
  )
  select jsonb_build_object(
    'checked_at', now(),
    'answers_without_results', jsonb_build_object(
      'count', (select count(*) from answers_no_results),
      'samples', coalesce((select jsonb_agg(user_id) from (select user_id from answers_no_results limit 50) s), '[]'::jsonb)
    ),
    'empty_results_object', jsonb_build_object(
      'count', (select count(*) from empty_results),
      'samples', coalesce((select jsonb_agg(user_id) from (select user_id from empty_results limit 50) s), '[]'::jsonb)
    ),
    'completed_without_results', jsonb_build_object(
      'count', (select count(*) from completed_no_results),
      'samples', coalesce((select jsonb_agg(user_id) from (select user_id from completed_no_results limit 50) s), '[]'::jsonb)
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.reset_journey(p_user_id uuid DEFAULT NULL::uuid, p_wipe_captures boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_out jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  -- You may reset yourself. Resetting anyone else requires admin.
  IF v_target <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  /* Every column the journey writes at finish. writeProfile cannot do this —
     it drops nulls by design — so the reset must live here in SQL. */
  UPDATE public.diagnostic_profiles SET
    onboarding_step = 0,
    onboarding_completed = false,
    completed = false,
    instrument_version = NULL,
    answered_band = NULL,
    seniority_band = NULL,
    band_source = NULL,
    skill_ratings = '{}'::jsonb,
    audit_results = '{}'::jsonb,
    audit_method = NULL,
    audit_completed_at = NULL,
    generated_skills = NULL,
    brand_assessment_answers = NULL,
    brand_assessment_results = NULL,
    brand_assessment_completed_at = NULL,
    brand_pillars = NULL,
    cv_crosscheck = NULL,
    identity_intelligence = '{}'::jsonb,
    journey_reset_at = now()
  WHERE user_id = v_target;

  DELETE FROM public.report_snapshots   WHERE user_id = v_target;
  DELETE FROM public.market_read        WHERE user_id = v_target;
  DELETE FROM public.assessment_sessions WHERE user_id = v_target;
  DELETE FROM public.evidence_jobs      WHERE user_id = v_target;

  IF p_wipe_captures THEN
    DELETE FROM public.evidence_fragments WHERE user_id = v_target;
    DELETE FROM public.entries            WHERE user_id = v_target;
  END IF;

  v_out := jsonb_build_object(
    'ok', true,
    'user_id', v_target,
    'captures_wiped', p_wipe_captures,
    'reset_at', now()
  );
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.resolve_member_handle(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    public.normalise_linkedin_handle((SELECT p.linkedin_handle FROM public.diagnostic_profiles p WHERE p.user_id = p_user_id)),
    public.normalise_linkedin_handle((SELECT r.handle FROM public.linkedin_read_readiness r WHERE r.user_id = p_user_id)),
    public.normalise_linkedin_handle((SELECT i.linkedin_handle FROM public.identity_registry i WHERE i.user_id = p_user_id))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rollback_design_version(p_target_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Deactivate current
  UPDATE public.design_system
  SET is_active = false, updated_at = now()
  WHERE scope = 'global' AND is_active = true;

  -- Reactivate target version
  UPDATE public.design_system
  SET is_active = true, updated_at = now()
  WHERE scope = 'global' AND version = p_target_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % not found', p_target_version;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_assessment_session(p_token text, p_state jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v int;
begin
  update public.assessment_sessions
    set state = p_state, last_seen_at = now()
    where token = p_token and user_id is null and expires_at > now();
  get diagnostics v = row_count;
  return v > 0;
end $function$
;

CREATE OR REPLACE FUNCTION public.search_vault(p_user_id uuid, p_query text, p_limit integer DEFAULT 15, p_query_embedding vector DEFAULT NULL::vector, p_kinds text[] DEFAULT NULL::text[], p_candidates integer DEFAULT 60)
 RETURNS TABLE(source_kind text, source_id uuid, title text, content text, url text, occurred_at timestamp with time zone, rank real, kw_rank real, vec_distance real, rrf real, metadata jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q tsquery;
  k constant integer := 60;   -- standard Reciprocal Rank Fusion constant
  cand integer := GREATEST(COALESCE(p_candidates, 60), 1);
  lim integer := GREATEST(COALESCE(p_limit, 15), 1);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF (p_query IS NULL OR btrim(p_query) = '') AND p_query_embedding IS NULL THEN
    RETURN;
  END IF;

  q := CASE WHEN p_query IS NULL OR btrim(p_query) = ''
            THEN NULL
            ELSE websearch_to_tsquery('english', p_query) END;

  RETURN QUERY
  WITH pool AS (
    -- a. document chunks
    SELECT
      'document_chunk'::text AS sk,
      dc.id AS sid,
      d.filename AS ttl,
      dc.content AS body,
      d.file_url AS link,
      dc.created_at AS occ,
      CASE WHEN q IS NOT NULL AND dc.tsv @@ q THEN ts_rank(dc.tsv, q)::real END AS kwr,
      CASE WHEN p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
                AND (dc.embedding <=> p_query_embedding) < 0.8
           THEN (dc.embedding <=> p_query_embedding)::real END AS vdist,
      jsonb_build_object(
        'chunk_index', dc.chunk_index,
        'page', dc.metadata -> 'page',
        'document_id', dc.document_id,
        'pipeline_version', dc.pipeline_version
      ) AS meta
    FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE dc.user_id = p_user_id
      AND (p_kinds IS NULL OR 'document_chunk' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND dc.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
            AND (dc.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- b. evidence fragments
    SELECT
      'evidence_fragment'::text,
      ef.id,
      ef.title,
      ef.content,
      NULL::text,
      ef.created_at,
      CASE WHEN q IS NOT NULL AND ef.tsv @@ q THEN ts_rank(ef.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND ef.embedding IS NOT NULL
                AND (ef.embedding <=> p_query_embedding) < 0.8
           THEN (ef.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'fragment_type', ef.fragment_type,
        'confidence', ef.confidence,
        'skill_pillars', to_jsonb(ef.skill_pillars),
        'tags', to_jsonb(ef.tags),
        'source_registry_id', ef.source_registry_id,
        'pipeline_version', ef.pipeline_version
      )
    FROM public.evidence_fragments ef
    WHERE ef.user_id = p_user_id
      AND (p_kinds IS NULL OR 'evidence_fragment' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND ef.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND ef.embedding IS NOT NULL
            AND (ef.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- c. entries
    SELECT
      'entry'::text,
      e.id,
      e.title,
      COALESCE(e.content, e.summary),
      e.image_url,
      e.created_at,
      CASE WHEN q IS NOT NULL AND e.tsv @@ q THEN ts_rank(e.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL
                AND (e.embedding <=> p_query_embedding) < 0.8
           THEN (e.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'type', e.type,
        'skill_pillar', e.skill_pillar
      )
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND (p_kinds IS NULL OR 'entry' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND e.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL
            AND (e.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- d. strategic signals
    SELECT
      'signal'::text,
      s.id,
      s.signal_title,
      concat_ws(' ', s.explanation, s.strategic_implications),
      NULL::text,
      s.created_at,
      CASE WHEN q IS NOT NULL AND s.tsv @@ q THEN ts_rank(s.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND s.embedding IS NOT NULL
                AND (s.embedding <=> p_query_embedding) < 0.8
           THEN (s.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'confidence', s.confidence,
        'priority_score', s.priority_score,
        'theme_tags', to_jsonb(s.theme_tags),
        'status', s.status,
        'velocity_status', s.velocity_status,
        'pipeline_version', s.pipeline_version
      )
    FROM public.strategic_signals s
    WHERE s.user_id = p_user_id
      AND (p_kinds IS NULL OR 'signal' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND s.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND s.embedding IS NOT NULL
            AND (s.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- e. posts
    SELECT
      'post'::text,
      lp.id,
      COALESCE(NULLIF(btrim(lp.hook), ''), left(COALESCE(lp.post_text, ''), 80)),
      lp.post_text,
      lp.linkedin_url,
      COALESCE(lp.published_at, lp.created_at),
      CASE WHEN q IS NOT NULL AND lp.tsv @@ q THEN ts_rank(lp.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND lp.embedding IS NOT NULL
                AND (lp.embedding <=> p_query_embedding) < 0.8
           THEN (lp.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'content_type', lp.content_type,
        'framework_type', lp.framework_type,
        'tracking_status', lp.tracking_status,
        'published_at', lp.published_at,
        'engagement_score', lp.engagement_score
      )
    FROM public.linkedin_posts lp
    WHERE lp.user_id = p_user_id
      AND (p_kinds IS NULL OR 'post' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND lp.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND lp.embedding IS NOT NULL
            AND (lp.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- f. learned intelligence (the member's own distilled knowledge)
    SELECT
      'learned_intelligence'::text,
      li.id,
      li.title,
      li.content,
      NULL::text,
      li.created_at,
      CASE WHEN q IS NOT NULL AND li.tsv @@ q THEN ts_rank(li.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL
                AND (li.embedding <=> p_query_embedding) < 0.8
           THEN (li.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'intelligence_type', li.intelligence_type,
        'skill_pillars', to_jsonb(li.skill_pillars),
        'tags', to_jsonb(li.tags),
        'source_entry_id', li.source_entry_id,
        'source_document_id', li.source_document_id
      )
    FROM public.learned_intelligence li
    WHERE li.user_id = p_user_id
      AND (p_kinds IS NULL OR 'learned_intelligence' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND li.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL
            AND (li.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- g. content items
    SELECT
      'content_item'::text,
      ci.id,
      ci.title,
      ci.body,
      NULL::text,
      ci.created_at,
      CASE WHEN q IS NOT NULL AND ci.tsv @@ q THEN ts_rank(ci.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND ci.embedding IS NOT NULL
                AND (ci.embedding <=> p_query_embedding) < 0.8
           THEN (ci.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'type', ci.type,
        'status', ci.status,
        'language', ci.language,
        'made_by', ci.made_by,
        'signal_id', ci.signal_id
      )
    FROM public.content_items ci
    WHERE ci.user_id = p_user_id
      AND (p_kinds IS NULL OR 'content_item' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND ci.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND ci.embedding IS NOT NULL
            AND (ci.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- h. document briefs (grounded whole-document reads)
    SELECT
      'brief'::text,
      db.id,
      (bd.filename || ' — brief'),
      concat_ws(E'\n',
        db.thesis,
        (SELECT string_agg(x->>'claim', E'\n') FROM jsonb_array_elements(coalesce(db.key_points, '[]'::jsonb)) x)
      ),
      bd.file_url,
      db.created_at,
      CASE WHEN q IS NOT NULL AND db.tsv @@ q THEN ts_rank(db.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND db.embedding IS NOT NULL
                AND (db.embedding <=> p_query_embedding) < 0.8
           THEN (db.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'grounding_score', db.grounding_score,
        'document_id', db.document_id,
        'pipeline_version', db.pipeline_version
      )
    FROM public.document_briefs db
    JOIN public.documents bd ON bd.id = db.document_id
    WHERE db.user_id = p_user_id
      AND (p_kinds IS NULL OR 'brief' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND db.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND db.embedding IS NOT NULL
            AND (db.embedding <=> p_query_embedding) < 0.8)
      )
  ),
  kw_ranked AS (
    SELECT pool.sk, pool.sid,
           row_number() OVER (ORDER BY pool.kwr DESC) AS pos
    FROM pool
    WHERE pool.kwr IS NOT NULL
    ORDER BY pool.kwr DESC
    LIMIT cand
  ),
  vec_ranked AS (
    SELECT pool.sk, pool.sid,
           row_number() OVER (ORDER BY pool.vdist ASC) AS pos
    FROM pool
    WHERE pool.vdist IS NOT NULL
    ORDER BY pool.vdist ASC
    LIMIT cand
  ),
  fused AS (
    SELECT
      p.*,
      (COALESCE(1.0 / (k + kr.pos), 0) + COALESCE(1.0 / (k + vr.pos), 0))::real AS rrf
    FROM pool p
    LEFT JOIN kw_ranked kr ON kr.sk = p.sk AND kr.sid = p.sid
    LEFT JOIN vec_ranked vr ON vr.sk = p.sk AND vr.sid = p.sid
    WHERE kr.pos IS NOT NULL OR vr.pos IS NOT NULL
  )
  SELECT
    f.sk,
    f.sid,
    f.ttl,
    f.body,
    f.link,
    f.occ,
    f.rrf,
    f.kwr,
    f.vdist,
    f.rrf,
    f.meta
  FROM fused f
  ORDER BY f.rrf DESC
  LIMIT lim;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_test_member(p_user_id uuid, p_persona text DEFAULT 'stranger'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_donor  uuid := '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3';
  v_e int := 0; v_f int := 0; v_s int := 0; v_d int := 0;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_persona NOT IN ('stranger','read','loop_quiet','loop_ready','dormant') THEN
    RAISE EXCEPTION 'unknown persona: %', p_persona;
  END IF;

  PERFORM public.reset_journey(p_user_id, true);
  INSERT INTO public.diagnostic_profiles (user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;

  IF p_persona = 'stranger' THEN
    RETURN jsonb_build_object('ok', true, 'persona', p_persona, 'seeded', 'nothing');
  END IF;

  UPDATE public.diagnostic_profiles SET
    first_name = 'Test', last_name = 'Member',
    firm = 'Test Advisory', level = 'Director',
    sector_focus = 'Consulting & Professional Services',
    seniority_band = 'table', band_source = 'seeded',
    onboarding_step = 4, onboarding_completed = true, completed = true,
    instrument_version = 2, answered_band = 'table',
    audit_method = 'self_read', audit_completed_at = now(),
    skill_ratings = (
      SELECT COALESCE(jsonb_object_agg(x.name, x.score), '{}'::jsonb) FROM (
        SELECT cd.name, 40 + (row_number() OVER (ORDER BY cd.position)) * 6 AS score
        FROM public.capability_dimensions cd WHERE cd.band='table' AND cd.active
      ) x
    ),
    last_visit_at = CASE WHEN p_persona='dormant' THEN now() - interval '20 days' ELSE now() END
  WHERE user_id = p_user_id;

  IF p_persona IN ('loop_quiet','loop_ready','dormant') THEN
    v_e := public._clone_member_rows('entries',            v_donor, p_user_id, 8);
    v_f := public._clone_member_rows('evidence_fragments', v_donor, p_user_id, 20);
    v_s := public._clone_member_rows('strategic_signals',  v_donor, p_user_id, 6);
  END IF;

  IF p_persona IN ('loop_ready','dormant') THEN
    v_d := public._clone_member_rows('content_items', v_donor, p_user_id, 4,
             jsonb_build_object('status','draft'));
  END IF;

  RETURN jsonb_build_object('ok', true, 'persona', p_persona,
    'entries', v_e, 'evidence', v_f, 'signals', v_s, 'drafts', v_d);
END $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_facet_states()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_assessment_run(p_token text, p_daily_cap integer DEFAULT 200)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_runs int; v_today int; v_is_admin boolean := false;
begin
  -- Reuse the existing admin concept: a row in public.user_roles, read via has_role().
  if auth.uid() is not null then
    v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  end if;

  select runs_started into v_runs from public.assessment_sessions
    where token = p_token and user_id is null and expires_at > now();
  if v_runs is null then raise exception 'NO_SESSION' using errcode='P0001'; end if;
  if not v_is_admin and v_runs >= 3 then raise exception 'RUN_ALREADY_USED' using errcode='P0001'; end if;
  if not v_is_admin then
    select coalesce(sum(runs_started),0) into v_today from public.assessment_sessions
      where created_at > now() - interval '24 hours';
    if v_today >= p_daily_cap then raise exception 'DAILY_CEILING' using errcode='P0001'; end if;
  end if;
  update public.assessment_sessions set runs_started = runs_started + 1, last_seen_at = now()
    where token = p_token;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.strategic_signals_tsv_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.signal_title, '') || ' ' ||
    coalesce(NEW.explanation, '') || ' ' ||
    coalesce(NEW.strategic_implications, ''));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tier_from_plan()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.tier := case when new.plan = 'trial' then 'loop' when new.plan = 'paid' then 'loop' else 'read' end;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tier_rank(t text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(array_position(array['observer','explorer','strategist','voice','presence'],
    lower(replace(coalesce(t,''),' ','_'))), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.touch_capability_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.answered_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.undeclared_jobs()
 RETURNS TABLE(jobid bigint, jobname text, schedule text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- The safety net that shows an undeclared job must not read as "all declared".
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT j.jobid, j.jobname::text, j.schedule::text
  FROM cron.job j
  WHERE j.active
    AND NOT EXISTS (
      SELECT 1 FROM public.freshness_checks f WHERE f.owning_job = j.jobname
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.voice_corpus_review(p_user_id uuid)
 RETURNS TABLE(id uuid, published_at timestamp with time zone, created_at timestamp with time zone, excerpt text, hook_style text, counts_toward_voice boolean, source_label text, set_aside_reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH reviewed AS (
    SELECT
      l.id,
      l.published_at,
      l.created_at,
      l.post_text AS excerpt,
      l.hook_style,
      l.source_type,
      l.authorship,
      l.acquisition,
      l.text_is_snippet,
      l.voice_corpus_status,
      -- Twin of voice_window(): this is the own-writing corpus predicate used for review labels.
      (
        l.post_text IS NOT NULL
        AND length(l.post_text) > 50
        AND COALESCE(l.authorship, 'unknown') <> 'aura_drafted'
        AND COALESCE(l.acquisition, 'unset') <> 'discovered'
        AND COALESCE(l.source_type, '') IN ('imported', 'linkedin_export', 'linkedin_own', 'manual_url', 'browser_capture')
        AND COALESCE(l.text_is_snippet, false) IS NOT TRUE
        AND COALESCE(l.voice_corpus_status, 'included') <> 'excluded'
      ) AS counts_toward_voice
    FROM public.linkedin_posts l
    WHERE l.user_id = p_user_id
      AND (auth.role() = 'service_role' OR auth.uid() = p_user_id)
      AND l.post_text IS NOT NULL
      AND trim(l.post_text) <> ''
  )
  SELECT
    r.id,
    r.published_at,
    r.created_at,
    r.excerpt,
    r.hook_style,
    r.counts_toward_voice,
    CASE
      WHEN r.source_type IN ('imported', 'linkedin_own') THEN 'Your post'
      WHEN r.source_type = 'linkedin_export' THEN 'From your LinkedIn export'
      WHEN r.source_type = 'aura_generated' THEN 'Written by Aura'
      WHEN r.source_type = 'search_discovery' THEN 'Found online'
      WHEN r.source_type IN ('manual_url', 'browser_capture') THEN 'Added by you'
      WHEN r.source_type = 'carousel_studio' THEN 'Written by Aura'
      ELSE 'Unknown source'
    END AS source_label,
    CASE
      WHEN r.counts_toward_voice THEN NULL
      WHEN COALESCE(r.voice_corpus_status, 'included') = 'excluded' THEN 'You set this aside'
      WHEN COALESCE(r.authorship, 'unknown') = 'aura_drafted' OR r.source_type IN ('aura_generated', 'carousel_studio') THEN 'Aura wrote this'
      WHEN COALESCE(r.text_is_snippet, false) IS TRUE THEN 'Only a fragment of text'
      WHEN COALESCE(r.acquisition, 'unset') = 'discovered' OR r.source_type = 'search_discovery' THEN 'Not written by you'
      WHEN length(COALESCE(r.excerpt, '')) <= 50 THEN 'Too short to read'
      ELSE NULL
    END AS set_aside_reason
  FROM reviewed r
  ORDER BY COALESCE(r.published_at, r.created_at) DESC NULLS LAST, r.created_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.voice_corpus_stats(p_user_id uuid)
 RETURNS TABLE(post_count integer, newest_published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int,
         max(COALESCE(l.published_at, l.created_at))
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') <> 'search_discovery'
    AND COALESCE(l.source_type,'') <> 'aura_generated'
    AND COALESCE(l.voice_corpus_status, 'included') <> 'excluded';
$function$
;

CREATE OR REPLACE FUNCTION public.voice_opener_diversity(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_entropy numeric := 0;
  r record;
  v_p numeric;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.voice_window(p_user_id) w
  WHERE w.hook_style IS NOT NULL;

  IF v_total < 8 THEN RETURN NULL; END IF;

  FOR r IN
    SELECT w.hook_style, count(*)::numeric AS n
    FROM public.voice_window(p_user_id) w
    WHERE w.hook_style IS NOT NULL
    GROUP BY w.hook_style
  LOOP
    v_p := r.n / v_total;
    v_entropy := v_entropy - (v_p * ln(v_p));
  END LOOP;

  -- 7 categories in the vocabulary, 'other' included.
  RETURN round((v_entropy / ln(7::numeric)) * 100, 1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.voice_profile_readiness(p_profile_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_posts int;
  v_low int;
  v_computable int;
  v_diversity numeric;
  v_share numeric;
BEGIN
  SELECT user_id INTO v_user FROM public.authority_voice_profiles WHERE id = p_profile_id;
  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_posts
  FROM public.linkedin_posts
  WHERE user_id = v_user
    AND post_text IS NOT NULL
    AND length(post_text) > 50
    AND COALESCE(authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(acquisition,'unset') <> 'discovered'
    AND COALESCE(source_type,'') NOT IN ('search_discovery','aura_generated');

  SELECT count(*) INTO v_low
  FROM public.voice_traits t
  JOIN public.voice_trait_registry r ON r.trait_key = t.trait_key
  WHERE t.profile_id = p_profile_id AND r.computable AND t.confidence = 'low';

  SELECT count(*) INTO v_computable FROM public.voice_trait_registry WHERE computable AND active;

  IF v_posts < 8 THEN RETURN 'forming'; END IF;
  IF v_posts < 20 THEN RETURN 'developing'; END IF;
  IF v_posts < 30 OR v_low > 0 OR v_computable = 0 THEN RETURN 'working'; END IF;

  v_diversity := public.voice_opener_diversity(v_user);
  SELECT t.share INTO v_share FROM public.voice_top_style_share(v_user) t;

  IF v_diversity IS NOT NULL AND v_diversity >= 60
     AND v_share IS NOT NULL AND v_share <= 35 THEN
    RETURN 'distinctive';
  END IF;
  RETURN 'reliable';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.voice_top_style_share(p_user_id uuid)
 RETURNS TABLE(share numeric, top_style text, top_count integer, window_total integer, other_dominant boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_top_real_style text;
  v_top_real_count int;
  v_max_any int;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.voice_window(p_user_id) w
  WHERE w.hook_style IS NOT NULL;

  IF v_total < 8 THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text, NULL::int, v_total, NULL::boolean;
    RETURN;
  END IF;

  SELECT COALESCE(max(c), 0) INTO v_max_any
  FROM (
    SELECT count(*)::int AS c
    FROM public.voice_window(p_user_id) w
    WHERE w.hook_style IS NOT NULL
    GROUP BY w.hook_style
  ) a;

  SELECT s, c INTO v_top_real_style, v_top_real_count
  FROM (
    SELECT w.hook_style AS s, count(*)::int AS c
    FROM public.voice_window(p_user_id) w
    WHERE w.hook_style IS NOT NULL AND w.hook_style <> 'other'
    GROUP BY w.hook_style
    ORDER BY count(*) DESC, w.hook_style
    LIMIT 1
  ) b;

  IF v_top_real_style IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text, NULL::int, v_total, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT round((v_top_real_count::numeric / v_total) * 100, 1),
                      v_top_real_style,
                      v_top_real_count,
                      v_total,
                      (v_max_any > v_top_real_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.voice_window(p_user_id uuid)
 RETURNS TABLE(id uuid, post_text text, hook_style text, ending_type text, published_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.id, l.post_text, l.hook_style, l.ending_type, l.published_at, l.created_at
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') <> 'search_discovery'
    AND COALESCE(l.source_type,'') <> 'aura_generated'
    AND COALESCE(l.voice_corpus_status,'included') <> 'excluded'
  ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC
  LIMIT 12;
$function$
;

CREATE OR REPLACE FUNCTION public.whatsapp_mint_pair_token()
 RETURNS TABLE(pair_token text, token_expires_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.whatsapp_links%ROWTYPE;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text := '';
  v_bytes bytea;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_existing FROM public.whatsapp_links WHERE user_id = v_uid;

  IF FOUND AND v_existing.status = 'active' THEN
    RETURN QUERY SELECT NULL::text, v_existing.token_expires_at, v_existing.status;
    RETURN;
  END IF;

  v_bytes := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v_token := v_token || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  END LOOP;

  INSERT INTO public.whatsapp_links (user_id, pair_token, token_expires_at, status)
  VALUES (v_uid, v_token, now() + interval '15 minutes', 'pending')
  ON CONFLICT (user_id) DO UPDATE
    SET pair_token = EXCLUDED.pair_token,
        token_expires_at = EXCLUDED.token_expires_at,
        status = 'pending';

  RETURN QUERY SELECT v_token, (now() + interval '15 minutes')::timestamptz, 'pending'::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.widget_slot_tally()
 RETURNS TABLE(slot_key text, vote_count integer, eligible_members integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.slot_key,
         count(*)::integer AS vote_count,
         (SELECT count(*)::integer FROM public.beta_allowlist
           WHERE status IN ('invited','active')) AS eligible_members
  FROM public.widget_slot_votes v
  GROUP BY v.slot_key;
$function$
;

