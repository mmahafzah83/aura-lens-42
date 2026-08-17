GRANT SELECT ON public.capability_dimensions TO anon;
GRANT SELECT ON public.onboarding_questions TO anon;
GRANT SELECT ON public.seniority_titles TO anon;
CREATE POLICY cd_read_anon ON public.capability_dimensions FOR SELECT TO anon USING (active);
CREATE POLICY oq_read_anon ON public.onboarding_questions FOR SELECT TO anon USING (active);
CREATE POLICY st_read_anon ON public.seniority_titles FOR SELECT TO anon USING (active);