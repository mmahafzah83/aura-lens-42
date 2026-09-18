ALTER TABLE public.oe_feeds ADD COLUMN IF NOT EXISTS access_finding text NOT NULL DEFAULT 'not_assessed';
ALTER TABLE public.oe_feeds DROP CONSTRAINT IF EXISTS oe_feeds_access_finding_check;
ALTER TABLE public.oe_feeds ADD CONSTRAINT oe_feeds_access_finding_check CHECK (access_finding = ANY (ARRAY['not_assessed','verified_permissive','robots_allows','robots_disallows','robots_unreadable','tos_prohibits','bot_defended','unreachable','no_public_listing']));

ALTER TABLE public.oe_feeds DROP CONSTRAINT IF EXISTS oe_feeds_kind_check;
ALTER TABLE public.oe_feeds ADD CONSTRAINT oe_feeds_kind_check CHECK (kind = ANY (ARRAY['rss','atom','sitemap','listing','html_list','api','json_api','embedded_json','telegram','calendar','manual','member_forward']));

ALTER TABLE public.oe_opportunities DROP CONSTRAINT IF EXISTS oe_opportunities_chair_type_check;
ALTER TABLE public.oe_opportunities ADD CONSTRAINT oe_opportunities_chair_type_check CHECK (chair_type = ANY (ARRAY['board','mandate','role','room','speaking','media','advisory','award','learning','consultation']));

INSERT INTO public.oe_vocabulary (key, en, ar, kind, note)
VALUES ('chair_consultation', 'Public consultation', 'استطلاع عام', 'chair', 'A dated, open government invitation to put a view on the record')
ON CONFLICT (key) DO UPDATE SET en = EXCLUDED.en, ar = EXCLUDED.ar, kind = EXCLUDED.kind;

CREATE TABLE IF NOT EXISTS public.oe_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  what_it_unlocks text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oe_registrations_status_check CHECK (status = ANY (ARRAY['not_started','in_progress','registered','declined'])),
  CONSTRAINT oe_registrations_name_key UNIQUE (name)
);

GRANT SELECT ON public.oe_registrations TO authenticated;
GRANT ALL ON public.oe_registrations TO service_role;
ALTER TABLE public.oe_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members may read the registration checklist" ON public.oe_registrations;
CREATE POLICY "Members may read the registration checklist" ON public.oe_registrations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins may change the registration checklist" ON public.oe_registrations;
CREATE POLICY "Admins may change the registration checklist" ON public.oe_registrations
  FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP TRIGGER IF EXISTS oe_registrations_touch ON public.oe_registrations;
CREATE TRIGGER oe_registrations_touch BEFORE UPDATE ON public.oe_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();