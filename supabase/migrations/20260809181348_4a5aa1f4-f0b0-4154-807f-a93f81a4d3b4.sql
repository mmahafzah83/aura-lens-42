-- 1. Pick a keeper per (user_id, mode_key): most traits wins, then newest, then id.
CREATE TEMP TABLE _keep ON COMMIT DROP AS
WITH ranked AS (
  SELECT p.id, p.user_id, p.mode_key,
         first_value(p.id) OVER (
           PARTITION BY p.user_id, p.mode_key
           ORDER BY (SELECT count(*) FROM public.voice_traits t WHERE t.profile_id = p.id) DESC,
                    p.updated_at DESC, p.id
         ) AS keeper
  FROM public.authority_voice_profiles p
  WHERE p.mode_key IS NOT NULL
)
SELECT id AS dupe_id, keeper FROM ranked WHERE id <> keeper;

UPDATE public.voice_traits t SET profile_id = k.keeper FROM _keep k WHERE t.profile_id = k.dupe_id;
UPDATE public.voice_rules r SET profile_id = k.keeper FROM _keep k WHERE r.profile_id = k.dupe_id;
UPDATE public.voice_feedback f SET profile_id = k.keeper FROM _keep k WHERE f.profile_id = k.dupe_id;
UPDATE public.voice_trait_rejections x SET profile_id = k.keeper FROM _keep k WHERE x.profile_id = k.dupe_id;

DELETE FROM public.authority_voice_profiles p USING _keep k WHERE p.id = k.dupe_id;

-- 2. One profile per person per mode, from here on.
CREATE UNIQUE INDEX IF NOT EXISTS authority_voice_profiles_user_mode_key
  ON public.authority_voice_profiles (user_id, mode_key);