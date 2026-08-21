GRANT SELECT ON public.known_issues TO authenticated;
GRANT ALL ON public.known_issues TO service_role;
CREATE POLICY "Admins can read known issues"
ON public.known_issues
FOR SELECT
TO authenticated
USING (public.is_current_user_admin());