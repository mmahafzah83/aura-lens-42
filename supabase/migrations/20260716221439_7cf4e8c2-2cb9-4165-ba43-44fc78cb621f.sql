
-- Replace hardcoded admin UUID policies with is_current_user_admin() function; restrict eval_metrics system rows to admins only.

-- beta_allowlist
DROP POLICY IF EXISTS "Admin only delete" ON public.beta_allowlist;
DROP POLICY IF EXISTS "Admin only insert" ON public.beta_allowlist;
DROP POLICY IF EXISTS "Admin only select" ON public.beta_allowlist;
DROP POLICY IF EXISTS "Admin only update" ON public.beta_allowlist;
CREATE POLICY "Admin only select" ON public.beta_allowlist FOR SELECT USING (public.is_current_user_admin());
CREATE POLICY "Admin only insert" ON public.beta_allowlist FOR INSERT WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin only update" ON public.beta_allowlist FOR UPDATE USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin only delete" ON public.beta_allowlist FOR DELETE USING (public.is_current_user_admin());

-- beta_feedback
DROP POLICY IF EXISTS "Admin reads all feedback" ON public.beta_feedback;
CREATE POLICY "Admin reads all feedback" ON public.beta_feedback FOR SELECT USING (public.is_current_user_admin());

-- design_system
DROP POLICY IF EXISTS "Admin can manage design system" ON public.design_system;
CREATE POLICY "Admin can manage design system" ON public.design_system FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- guide_slug_misses
DROP POLICY IF EXISTS "Admin only select misses" ON public.guide_slug_misses;
CREATE POLICY "Admin only select misses" ON public.guide_slug_misses FOR SELECT USING (public.is_current_user_admin());

-- lifecycle_emails
DROP POLICY IF EXISTS "Admin reads all emails" ON public.lifecycle_emails;
CREATE POLICY "Admin reads all emails" ON public.lifecycle_emails FOR SELECT USING (public.is_current_user_admin());

-- page_backgrounds
DROP POLICY IF EXISTS "admin_manage_page_backgrounds" ON public.page_backgrounds;
CREATE POLICY "admin_manage_page_backgrounds" ON public.page_backgrounds FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- qa_audit_results
DROP POLICY IF EXISTS "Admin only" ON public.qa_audit_results;
CREATE POLICY "Admin only" ON public.qa_audit_results FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- qa_reports
DROP POLICY IF EXISTS "Admin can delete qa_reports" ON public.qa_reports;
DROP POLICY IF EXISTS "Admin can insert qa_reports" ON public.qa_reports;
DROP POLICY IF EXISTS "Admin can update qa_reports" ON public.qa_reports;
DROP POLICY IF EXISTS "Admin reads qa reports" ON public.qa_reports;
CREATE POLICY "Admin reads qa reports" ON public.qa_reports FOR SELECT USING (public.is_current_user_admin());
CREATE POLICY "Admin can insert qa_reports" ON public.qa_reports FOR INSERT WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can update qa_reports" ON public.qa_reports FOR UPDATE USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin can delete qa_reports" ON public.qa_reports FOR DELETE USING (public.is_current_user_admin());

-- eval_metrics: restrict null-user (system) rows to admins; users still see their own
DROP POLICY IF EXISTS "eval_metrics_select_own_or_system" ON public.eval_metrics;
CREATE POLICY "eval_metrics_select_own_or_admin_system"
  ON public.eval_metrics
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND public.is_current_user_admin())
  );
