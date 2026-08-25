-- A member writes in more than one language; a mode is per language, not per
-- member. The old indexes made a second-language "default" impossible, which
-- is why the repaired rows below could not be given a mode.
drop index if exists public.authority_voice_profiles_user_mode_key;
drop index if exists public.authority_voice_profiles_user_mode_uq;
create unique index authority_voice_profiles_user_mode_lang_uq
  on public.authority_voice_profiles (user_id, mode_key, language)
  where mode_key is not null;

-- Stranded rows: no mode means the Voice surface skips them entirely.
update public.authority_voice_profiles
   set mode_key = 'default',
       mode_label = coalesce(mode_label, 'Your voice')
 where mode_key is null;

select cron.schedule(
  'voice-compute-traits-weekly',
  '0 4 * * 1',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/voice-compute-traits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := jsonb_build_object('user_id', u.user_id)
  ) as request_id
  from (
    select distinct p.user_id
    from public.linkedin_posts p
    where p.post_text is not null
      and coalesce(p.authorship, '') <> 'aura_drafted'
      and coalesce(p.acquisition, '') <> 'discovered'
      and coalesce(p.voice_corpus_status, '') <> 'excluded'
      and coalesce(p.text_is_snippet, false) = false
  ) u;
  $$
);