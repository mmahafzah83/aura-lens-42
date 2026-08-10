CREATE OR REPLACE VIEW public.cockpit_pulse AS
 SELECT now() AS as_of,
    ( SELECT count(*) AS count FROM cockpit_members) AS members,
    ( SELECT count(*) FILTER (WHERE cockpit_members.active_7d) AS count FROM cockpit_members) AS active_7d,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'shipping'::text) AS count FROM cockpit_members) AS shipping,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'started'::text) AS count FROM cockpit_members) AS started,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'drawer'::text) AS count FROM cockpit_members) AS drawer,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'cold'::text) AS count FROM cockpit_members) AS cold,
    ( SELECT COALESCE(sum(cockpit_members.captures), 0::numeric) AS "coalesce" FROM cockpit_members) AS captures_total,
    ( SELECT count(*) AS count FROM entries
       WHERE entries.user_id NOT IN ( SELECT diagnostic_profiles.user_id FROM diagnostic_profiles WHERE diagnostic_profiles.is_internal)
         AND entries.created_at > (now() - '7 days'::interval)) AS captures_7d,
    ( SELECT count(*) AS count FROM linkedin_posts
       WHERE linkedin_posts.user_id NOT IN ( SELECT diagnostic_profiles.user_id FROM diagnostic_profiles WHERE diagnostic_profiles.is_internal)) AS posts_total,
    ( SELECT COALESCE(sum(cockpit_members.posts_through_aura), 0::numeric) AS "coalesce" FROM cockpit_members) AS posts_through_aura,
    ( SELECT count(*) AS count FROM lifecycle_email_log WHERE lifecycle_email_log.sent_at > (now() - '7 days'::interval)) AS emails_7d,
    ( SELECT count(*) AS count FROM ef_faults WHERE ef_faults.created_at > (now() - '48:00:00'::interval)) AS faults_48h,
    ( SELECT count(*) AS count FROM health_findings WHERE health_findings.resolved_at IS NULL) AS health_open;