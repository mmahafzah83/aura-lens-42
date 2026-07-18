CREATE POLICY "Admins can resolve ops alerts" ON public.ops_alerts
  FOR UPDATE USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());