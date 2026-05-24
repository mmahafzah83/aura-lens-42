DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'entries','diagnostic_profiles','linkedin_posts',
    'aura_conversation_memory','authority_voice_profiles','authority_scores',
    'content_items','evidence_fragments','master_frameworks',
    'industry_trends','market_mirror_cache',
    'notification_events','notifications','linkedin_post_metrics',
    'linkedin_connections','influence_snapshots','focus_accounts',
    'framework_activations','import_jobs','document_chunks','documents',
    'learned_intelligence','chat_messages','chat_conversations',
    'captures','narrative_suggestions','discovery_review_queue',
    'beta_feedback','lifecycle_emails'
  ];
  conname text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip if table or user_id column doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) THEN
      CONTINUE;
    END IF;

    -- Drop any existing FK constraints on user_id for this table
    FOR conname IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      WHERE ns.nspname = 'public'
        AND cls.relname = t
        AND con.contype = 'f'
        AND EXISTS (
          SELECT 1 FROM unnest(con.conkey) AS k
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
          WHERE a.attname = 'user_id'
        )
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, conname);
    END LOOP;

    -- Add CASCADE FK to auth.users(id)
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
      t, t || '_user_id_fkey'
    );
  END LOOP;
END $$;