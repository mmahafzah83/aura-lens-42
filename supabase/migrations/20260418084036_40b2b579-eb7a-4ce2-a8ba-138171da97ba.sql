ALTER TABLE public.industry_trends
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS impact_level text;