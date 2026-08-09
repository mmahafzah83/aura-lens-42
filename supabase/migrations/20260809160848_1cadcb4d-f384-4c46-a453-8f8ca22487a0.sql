ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_hook_style_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_hook_style_vocab
  CHECK (hook_style IS NULL OR hook_style = ANY (ARRAY[
    'scene','number','confession','claim','question','dialogue','contrast',
    'contrarian_claim','number_first','short_story','experience_led','announcement','other'
  ]));

ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_ending_type_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_ending_type_vocab
  CHECK (ending_type IS NULL OR ending_type = ANY (ARRAY[
    'hanging_line','equation','number','reframe','question','signature',
    'suspended','cta','other'
  ]));