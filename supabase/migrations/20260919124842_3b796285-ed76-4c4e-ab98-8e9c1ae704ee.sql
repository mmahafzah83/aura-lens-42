CREATE TABLE IF NOT EXISTS public.oe_member_identity (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_id uuid,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  professions jsonb NOT NULL DEFAULT '[]'::jsonb,
  highest_standing jsonb NOT NULL DEFAULT '{}'::jsonb,
  sectors_delivered jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  built_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oe_member_identity TO authenticated;
GRANT ALL ON public.oe_member_identity TO service_role;
ALTER TABLE public.oe_member_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own derived identity" ON public.oe_member_identity;
CREATE POLICY "Members read their own derived identity"
  ON public.oe_member_identity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_current_user_admin());

DROP TRIGGER IF EXISTS update_oe_member_identity_updated_at ON public.oe_member_identity;
CREATE TRIGGER update_oe_member_identity_updated_at
  BEFORE UPDATE ON public.oe_member_identity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.oe_matches
  ADD COLUMN IF NOT EXISTS screen_gate text,
  ADD COLUMN IF NOT EXISTS screen_outcome text,
  ADD COLUMN IF NOT EXISTS rejection_sentence text,
  ADD COLUMN IF NOT EXISTS presentation_line text,
  ADD COLUMN IF NOT EXISTS role_profession text,
  ADD COLUMN IF NOT EXISTS profession_relation text,
  ADD COLUMN IF NOT EXISTS employer_tier text,
  ADD COLUMN IF NOT EXISTS level_direction text,
  ADD COLUMN IF NOT EXISTS standing_gap numeric,
  ADD COLUMN IF NOT EXISTS screened_at timestamptz;

ALTER TABLE public.oe_matches DROP CONSTRAINT IF EXISTS oe_matches_screen_gate_check;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_screen_gate_check
  CHECK (screen_gate IS NULL OR screen_gate = ANY (ARRAY['licence','profession','level','presentation','scored']));

ALTER TABLE public.oe_matches DROP CONSTRAINT IF EXISTS oe_matches_screen_outcome_check;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_screen_outcome_check
  CHECK (screen_outcome IS NULL OR screen_outcome = ANY (ARRAY['rejected','unknown','survivor']));

ALTER TABLE public.oe_matches DROP CONSTRAINT IF EXISTS oe_matches_level_direction_check;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_level_direction_check
  CHECK (level_direction IS NULL OR level_direction = ANY (ARRAY['below','lateral','one_above','two_plus','unknown']));

ALTER TABLE public.oe_write_value
  ADD COLUMN IF NOT EXISTS has_standing boolean,
  ADD COLUMN IF NOT EXISTS standing_reason text;
