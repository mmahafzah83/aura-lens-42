
ALTER TABLE public.oe_direction ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.oe_direction DROP CONSTRAINT IF EXISTS oe_direction_language_check;
ALTER TABLE public.oe_direction ADD CONSTRAINT oe_direction_language_check CHECK (language IS NULL OR language IN ('en','ar'));
COMMENT ON COLUMN public.oe_direction.language IS 'The language the member chose for the opportunities tab. NULL means English.';

CREATE OR REPLACE FUNCTION public.oe_direction_save(p_priority text DEFAULT NULL::text, p_mix text DEFAULT NULL::text, p_defer boolean DEFAULT false, p_language text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_row oe_direction%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('bigger_seat','known_for_one','new_rooms','out_of_sector','stay_current') THEN RAISE EXCEPTION 'unknown priority'; END IF;
  IF p_mix IS NOT NULL AND p_mix NOT IN ('win','build','explore') THEN RAISE EXCEPTION 'unknown mix'; END IF;
  IF p_language IS NOT NULL AND p_language NOT IN ('en','ar') THEN RAISE EXCEPTION 'unknown language'; END IF;
  INSERT INTO oe_direction(user_id,priority,priority_set_on,priority_expires_at,mix,mix_set_on,language)
  VALUES(v_uid,p_priority,CASE WHEN p_priority IS NOT NULL THEN current_date END,
    CASE WHEN p_priority IS NOT NULL THEN current_date+90 WHEN p_defer THEN current_date+7 END,
    p_mix,CASE WHEN p_mix IS NOT NULL THEN current_date END,p_language)
  ON CONFLICT(user_id) DO UPDATE SET
    priority=COALESCE(EXCLUDED.priority,oe_direction.priority),
    priority_set_on=CASE WHEN EXCLUDED.priority IS NOT NULL THEN current_date ELSE oe_direction.priority_set_on END,
    priority_expires_at=CASE WHEN EXCLUDED.priority IS NOT NULL THEN current_date+90 WHEN p_defer THEN current_date+7 ELSE oe_direction.priority_expires_at END,
    mix=COALESCE(EXCLUDED.mix,oe_direction.mix),
    mix_set_on=CASE WHEN EXCLUDED.mix IS NOT NULL THEN current_date ELSE oe_direction.mix_set_on END,
    language=COALESCE(EXCLUDED.language,oe_direction.language),
    updated_at=now()
  RETURNING * INTO v_row;
  PERFORM public.oe_refresh_purpose(v_uid);
  RETURN to_jsonb(v_row);
END $function$;
