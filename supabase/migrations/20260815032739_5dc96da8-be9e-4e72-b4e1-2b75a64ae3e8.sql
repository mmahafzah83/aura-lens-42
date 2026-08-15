alter table public.documents
  add column if not exists document_type text
    check (document_type in ('cv','portfolio','project','testimonial','talk','other')),
  add column if not exists cv_label text
    check (cv_label is null or cv_label in ('latest','best','target'));

alter table public.diagnostic_profiles
  add column if not exists cv_crosscheck jsonb,
  add column if not exists cv_crosscheck_at timestamptz;