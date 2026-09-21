-- ── A) what the posting states, extracted once per record ──────────────────
ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS scope_evidence jsonb;

COMMENT ON COLUMN public.oe_opportunities.scope_evidence IS
  'What the posting STATES, each with its verbatim quote. Extracted once per record at read time, never per member. Unstated fields are null; nothing is inferred into a null.';

-- how the screen established grade and profession, so a verdict is auditable
ALTER TABLE public.oe_matches
  ADD COLUMN IF NOT EXISTS grade_basis text,
  ADD COLUMN IF NOT EXISTS profession_source text,
  ADD COLUMN IF NOT EXISTS profession_source_quote text;

DO $$ BEGIN
  ALTER TABLE public.oe_matches
    ADD CONSTRAINT oe_matches_grade_basis_check
    CHECK (grade_basis IS NULL OR grade_basis IN ('title','proxies','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.oe_matches
    ADD CONSTRAINT oe_matches_profession_source_check
    CHECK (profession_source IS NULL OR profession_source IN ('title','accountability_sentence','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── B) the ladder stands on evidence ───────────────────────────────────────
ALTER TABLE public.oe_employer_ladder
  ADD COLUMN IF NOT EXISTS sector_code text,
  ADD COLUMN IF NOT EXISTS size_band text,
  ADD COLUMN IF NOT EXISTS complexity text,
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'judgement',
  ADD COLUMN IF NOT EXISTS basis_note text;

DO $$ BEGIN
  ALTER TABLE public.oe_employer_ladder
    ADD CONSTRAINT oe_employer_ladder_size_band_check
    CHECK (size_band IS NULL OR size_band IN ('mega','large','mid','small'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.oe_employer_ladder
    ADD CONSTRAINT oe_employer_ladder_complexity_check
    CHECK (complexity IS NULL OR complexity IN ('multi_division_intl','multi_division','single_line'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.oe_employer_ladder
    ADD CONSTRAINT oe_employer_ladder_basis_check
    CHECK (basis IN ('evidenced','judgement'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- the bonus is derived from size and complexity, never typed.
-- A row with no size band keeps the bonus it has, and stays a judgement.
CREATE OR REPLACE FUNCTION public.oe_ladder_bonus(p_size text, p_complexity text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_size = 'mega'  AND p_complexity = 'multi_division_intl' THEN 1.5
    WHEN p_size = 'mega'                                           THEN 1.0
    WHEN p_size = 'large' AND p_complexity = 'multi_division'      THEN 1.0
    WHEN p_size = 'large'                                          THEN 0.5
    WHEN p_size = 'mid'                                            THEN 0.25
    ELSE 0
  END::numeric
$$;

CREATE OR REPLACE FUNCTION public.oe_employer_ladder_derive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.size_band IS NOT NULL THEN
    NEW.standing_bonus := public.oe_ladder_bonus(NEW.size_band, NEW.complexity);
    NEW.basis := 'evidenced';
  ELSE
    NEW.basis := 'judgement';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oe_employer_ladder_derive ON public.oe_employer_ladder;
CREATE TRIGGER trg_oe_employer_ladder_derive
  BEFORE INSERT OR UPDATE ON public.oe_employer_ladder
  FOR EACH ROW EXECUTE FUNCTION public.oe_employer_ladder_derive();

-- the ten Saudi employers whose size is public and obvious
UPDATE public.oe_employer_ladder SET
  size_band = 'mega',
  complexity = 'multi_division_intl',
  basis_note = 'size and international multi-division structure are publicly stated by the employer'
WHERE country = 'SA' AND band = 'anchor' AND (
     pattern ILIKE '%aramco%'
  OR pattern ILIKE '%public investment fund%'
  OR pattern ILIKE '%sabic%'
  OR pattern ILIKE '%saudi telecom%'
  OR pattern ILIKE '%neom%'
  OR pattern ILIKE '%ma%aden%'
  OR pattern ILIKE '%saudia%'
);

UPDATE public.oe_employer_ladder SET
  size_band = 'mega',
  complexity = 'multi_division',
  basis_note = 'size and multi-division national structure are publicly stated by the employer'
WHERE country = 'SA' AND band = 'anchor' AND (
     pattern ILIKE '%saudi national bank%'
  OR pattern ILIKE '%rajhi%'
  OR pattern ILIKE '%saudi electricity%'
  OR pattern ILIKE '%\bsec\b%'
);

-- the list a human corrects first: a judgement, ordered by how much it touches
CREATE OR REPLACE VIEW public.oe_ladder_judgement_review
WITH (security_invoker = true) AS
SELECT
  l.id, l.country, l.band, l.pattern, l.label_en,
  l.standing_bonus, l.size_band, l.complexity, l.basis, l.basis_note,
  (SELECT count(*) FROM public.oe_opportunities o
    WHERE o.issuer_raw IS NOT NULL AND o.issuer_raw ~* l.pattern) AS opportunities_touched
FROM public.oe_employer_ladder l
WHERE l.basis = 'judgement' AND l.active
ORDER BY opportunities_touched DESC, l.country, l.pattern;

GRANT SELECT ON public.oe_ladder_judgement_review TO service_role;