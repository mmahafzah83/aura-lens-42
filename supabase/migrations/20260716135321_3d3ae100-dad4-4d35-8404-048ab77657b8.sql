-- First-signal "aha" in-app notification: idempotent trigger on strategic_signals
CREATE OR REPLACE FUNCTION public.notify_first_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang text;
  v_title text;
  v_body text;
  v_exists boolean;
BEGIN
  -- Idempotency guard: only ever one first_signal_aha per user
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.user_id
      AND metadata->>'kind' = 'first_signal_aha'
  ) INTO v_exists;
  IF v_exists THEN
    RETURN NEW;
  END IF;

  -- Language preference (default EN)
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
    NEW.user_id,
    'momentum',
    v_title,
    v_body,
    jsonb_build_object(
      'kind', 'first_signal_aha',
      'signal_id', NEW.id,
      'signal_title', NEW.signal_title,
      'cta', '/dashboard?tab=intelligence'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_first_signal ON public.strategic_signals;
CREATE TRIGGER trg_notify_first_signal
AFTER INSERT ON public.strategic_signals
FOR EACH ROW
EXECUTE FUNCTION public.notify_first_signal();