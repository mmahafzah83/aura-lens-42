CREATE TABLE public.beta_allowlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  seniority TEXT CHECK (seniority IN ('C-Suite','VP','Director','Manager','Other')),
  sector TEXT CHECK (sector IN ('Consulting','Energy','Finance','Government','Technology','Other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','active')),
  source TEXT DEFAULT 'waitlist',
  personal_note TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.beta_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only select" ON public.beta_allowlist
  FOR SELECT USING (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3');

CREATE POLICY "Admin only insert" ON public.beta_allowlist
  FOR INSERT WITH CHECK (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3');

CREATE POLICY "Admin only update" ON public.beta_allowlist
  FOR UPDATE USING (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3');

CREATE POLICY "Admin only delete" ON public.beta_allowlist
  FOR DELETE USING (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3');

CREATE INDEX idx_beta_allowlist_email ON public.beta_allowlist(email);
CREATE INDEX idx_beta_allowlist_status ON public.beta_allowlist(status);

CREATE TRIGGER update_beta_allowlist_updated_at
BEFORE UPDATE ON public.beta_allowlist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();