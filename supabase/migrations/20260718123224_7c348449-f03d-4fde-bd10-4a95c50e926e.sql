-- 1. Add missing column
ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS content_language text NOT NULL DEFAULT 'en';

-- 2. Rebuild trigger function with exception guard
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
$function$;