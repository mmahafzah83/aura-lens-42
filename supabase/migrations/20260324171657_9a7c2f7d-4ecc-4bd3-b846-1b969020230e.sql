
ALTER TABLE public.master_frameworks
ADD COLUMN diagram_url text,
ADD COLUMN diagram_description jsonb DEFAULT '{}'::jsonb;
