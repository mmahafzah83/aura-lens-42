ALTER TABLE public.authority_voice_profiles
  DROP CONSTRAINT IF EXISTS authority_voice_profiles_user_id_language_key;

UPDATE public.authority_voice_profiles
  SET mode_label = 'Your voice'
  WHERE mode_key = 'default' AND mode_label IS DISTINCT FROM 'Your voice';