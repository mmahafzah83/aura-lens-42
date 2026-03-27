
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS carousel_structure_type text,
  ADD COLUMN IF NOT EXISTS hook_style text,
  ADD COLUMN IF NOT EXISTS cta_style text,
  ADD COLUMN IF NOT EXISTS content_engine_output_type text,
  ADD COLUMN IF NOT EXISTS visual_strategy_type text;
