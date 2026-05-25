DROP POLICY IF EXISTS "Anyone can read active design system" ON public.design_system;

CREATE POLICY "Authenticated users can read active design system"
  ON public.design_system
  FOR SELECT
  TO authenticated
  USING (is_active = true);