ALTER TABLE public.documents
  ADD CONSTRAINT documents_cv_label_requires_cv_type
  CHECK (cv_label IS NULL OR document_type = 'cv');