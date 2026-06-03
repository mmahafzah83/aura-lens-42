ALTER TABLE public.authority_voice_profiles DROP CONSTRAINT authority_voice_profiles_user_id_key;

ALTER TABLE public.authority_voice_profiles ADD CONSTRAINT authority_voice_profiles_user_id_language_key UNIQUE (user_id, language);

CREATE UNIQUE INDEX authority_voice_profiles_one_primary_per_user_idx ON public.authority_voice_profiles (user_id) WHERE is_primary = true;