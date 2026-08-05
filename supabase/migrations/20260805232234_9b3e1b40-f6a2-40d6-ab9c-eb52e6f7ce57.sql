ALTER TABLE public.authority_voice_profiles
  ADD COLUMN IF NOT EXISTS allowed_endings text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS unsourced_numbers_removed integer NOT NULL DEFAULT 0;

UPDATE public.linkedin_posts SET hook_style = CASE lower(coalesce(hook_style,''))
  WHEN 'statement' THEN 'claim'
  WHEN 'statistic' THEN 'number'
  WHEN 'story' THEN 'scene'
  WHEN 'contrarian' THEN 'contrast'
  WHEN 'quote' THEN 'dialogue'
  WHEN 'question' THEN 'question'
  WHEN 'scene' THEN 'scene'
  WHEN 'number' THEN 'number'
  WHEN 'confession' THEN 'confession'
  WHEN 'claim' THEN 'claim'
  WHEN 'dialogue' THEN 'dialogue'
  WHEN 'contrast' THEN 'contrast'
  WHEN '' THEN NULL
  ELSE 'claim' END
WHERE hook_style IS NOT NULL;

UPDATE public.linkedin_posts SET ending_type = CASE lower(coalesce(ending_type,''))
  WHEN 'reflection' THEN 'hanging_line'
  WHEN 'call_to_action' THEN 'signature'
  WHEN 'takeaway' THEN 'equation'
  WHEN 'question' THEN 'question'
  WHEN 'hanging_line' THEN 'hanging_line'
  WHEN 'equation' THEN 'equation'
  WHEN 'number' THEN 'number'
  WHEN 'reframe' THEN 'reframe'
  WHEN 'signature' THEN 'signature'
  WHEN '' THEN NULL
  ELSE 'hanging_line' END
WHERE ending_type IS NOT NULL;

UPDATE public.linkedin_posts SET stance = CASE lower(coalesce(stance,''))
  WHEN 'contrarian' THEN 'asserts'
  WHEN 'cautionary' THEN 'doubts'
  WHEN 'advocacy' THEN 'teaches'
  WHEN 'personal' THEN 'story'
  WHEN 'analysis' THEN 'analysis'
  WHEN 'asserts' THEN 'asserts'
  WHEN 'story' THEN 'story'
  WHEN 'teaches' THEN 'teaches'
  WHEN 'doubts' THEN 'doubts'
  WHEN '' THEN NULL
  ELSE 'analysis' END
WHERE stance IS NOT NULL;

ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_hook_style_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_hook_style_vocab
  CHECK (hook_style IS NULL OR hook_style IN ('scene','number','confession','claim','question','dialogue','contrast'));

ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_ending_type_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_ending_type_vocab
  CHECK (ending_type IS NULL OR ending_type IN ('hanging_line','equation','number','reframe','question','signature'));

ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_stance_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_stance_vocab
  CHECK (stance IS NULL OR stance IN ('asserts','story','teaches','doubts','analysis'));