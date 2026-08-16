GRANT SELECT ON public.audit_interpretation_backup_20260816 TO authenticated;
GRANT ALL ON public.audit_interpretation_backup_20260816 TO service_role;
ALTER TABLE public.audit_interpretation_backup_20260816 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own assessment backup"
  ON public.audit_interpretation_backup_20260816
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);