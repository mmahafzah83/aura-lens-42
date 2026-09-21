
CREATE TABLE IF NOT EXISTS public.oe_member_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'decision_rights','budget_or_pnl','team_size','organisational_scope',
    'delivered_outcome','sector_delivered','qualification','stated_position','capability')),
  claim text NOT NULL,
  quote text NOT NULL,
  source_table text NOT NULL,
  source_id uuid,
  source_field text,
  position_ref text,
  confidence numeric NOT NULL DEFAULT 0.8,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES public.oe_member_evidence(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_member_evidence TO authenticated;
GRANT ALL ON public.oe_member_evidence TO service_role;

ALTER TABLE public.oe_member_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own evidence read" ON public.oe_member_evidence
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own evidence insert" ON public.oe_member_evidence
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own evidence update" ON public.oe_member_evidence
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own evidence delete" ON public.oe_member_evidence
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS oe_member_evidence_user_kind_idx
  ON public.oe_member_evidence (user_id, kind) WHERE superseded_by IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oe_member_evidence_dedup_idx
  ON public.oe_member_evidence (user_id, kind, md5(claim), md5(quote));

CREATE TRIGGER oe_member_evidence_touch
  BEFORE UPDATE ON public.oe_member_evidence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.oe_matches
  ADD COLUMN IF NOT EXISTS presentation_evidence_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.oe_investigations
  ADD COLUMN IF NOT EXISTS member_question text,
  ADD COLUMN IF NOT EXISTS asked_on date,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz;

CREATE OR REPLACE FUNCTION public.oe_member_answer(p_investigation uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_inv record; v_answer text := btrim(coalesce(p_answer,'')); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF length(v_answer) < 2 THEN RETURN jsonb_build_object('ok', false, 'error', 'empty answer'); END IF;
  SELECT * INTO v_inv FROM oe_investigations
   WHERE id = p_investigation AND user_id = v_uid AND status = 'open';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no open question'); END IF;

  INSERT INTO oe_member_evidence (user_id, kind, claim, quote, source_table, source_id, source_field, confidence)
  VALUES (v_uid, v_inv.field, left(v_answer, 600), left(v_answer, 600), 'member_answer', v_inv.id, 'answer', 1.0)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  UPDATE oe_investigations
     SET status = 'resolved', resolved_value = left(v_answer, 600),
         answered_at = now(), updated_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'evidence_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.oe_member_answer(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_member_answer(uuid, text) TO authenticated;
