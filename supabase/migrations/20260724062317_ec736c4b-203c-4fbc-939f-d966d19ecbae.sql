-- PART 1: Self-healing authorship trigger on linkedin_posts
CREATE OR REPLACE FUNCTION public.enforce_published_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Leave unpublished rows alone.
  IF NEW.published_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fill in when authorship is missing or invalid.
  IF NEW.authorship IS NULL
     OR NEW.authorship NOT IN ('aura_drafted','aura_assisted','user_written','unknown') THEN
    IF NEW.source_type = 'aura_generated' THEN
      NEW.authorship := 'aura_drafted';
    ELSIF NEW.source_type IN ('linkedin_export','csv_import') THEN
      NEW.authorship := 'user_written';
    ELSE
      NEW.authorship := 'unknown';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_linkedin_posts_authorship_guard ON public.linkedin_posts;
CREATE TRIGGER trg_linkedin_posts_authorship_guard
  BEFORE INSERT OR UPDATE ON public.linkedin_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_published_authorship();

-- PART 2: known_issues register
CREATE TABLE public.known_issues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  detail        text,
  severity      text NOT NULL CHECK (severity IN ('low','medium','high')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','resolved')),
  area          text,
  trigger_note  text,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.known_issues TO service_role;

ALTER TABLE public.known_issues ENABLE ROW LEVEL SECURITY;
-- Intentionally zero policies: service-role only.

CREATE INDEX known_issues_status_severity_idx
  ON public.known_issues (status, severity);

CREATE TRIGGER known_issues_set_updated_at
  BEFORE UPDATE ON public.known_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed today's 9 open issues.
INSERT INTO public.known_issues (title, detail, severity, area, trigger_note) VALUES
('Home always offers the same draft',
 'Brief returns ready[0] forever; a second weekly draft is unreachable.',
 'medium', 'frontend', 'Any user holding 2+ drafts.'),
('No provenance line on Next Move',
 'Card never says where the draft came from or why this week.',
 'medium', 'frontend', NULL),
('Email visual design and dark mode not addressed',
 'emailShell untouched; Gmail dark mode inverts it to muddy brown. Copy was restructured, styling was not.',
 'medium', 'email', NULL),
('night-agent-hunt still uses the sequential per-user loop',
 'Same ~1-user-per-invocation ceiling the voice sweep had.',
 'medium', 'queue', '5th publisher.'),
('No per-user cost ceiling on distillation',
 'The queue controls concurrency, not spend.',
 'medium', 'cost', '10 active publishers or first noticeable Anthropic bill.'),
('content_type is null on most aura_generated posts',
 'Separate from the authorship invariant; affects analytics fidelity only.',
 'low', 'content', NULL),
('Ghost drafts produce the weakest email variant',
 'No linked signal means no evidence counts and no urgency line.',
 'low', 'email', NULL),
('Language toggle not offered on Next Move',
 NULL,
 'low', 'frontend', 'First non-founder with an Arabic primary voice.'),
('voice-distill reads only the 40 most recent posts',
 'Compounding voice is currently a rolling window that forgets rather than accumulates. Founder product decision, not a bug.',
 'medium', 'voice', NULL);