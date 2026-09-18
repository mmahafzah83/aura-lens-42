CREATE TABLE public.oe_surfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.oe_entities(id) ON DELETE CASCADE,
  surface_type text NOT NULL CHECK (surface_type IN ('careers','news','press','insights','events','tenders','leadership','investor_relations','blog','podcast','directory')),
  url text NOT NULL,
  harvest_kind text NOT NULL CHECK (harvest_kind IN ('ats_api','rss','atom','sitemap','json_ld','json_api','html_list','pdf_list')),
  ats_platform text,
  ats_token text,
  yields text[] NOT NULL DEFAULT '{}',
  cadence text NOT NULL DEFAULT 'weekly',
  selector text,
  terms_ok boolean DEFAULT false,
  access_finding text,
  terms_note text,
  last_harvested_at timestamptz,
  harvest_yield numeric,
  read_yield numeric,
  health text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, surface_type, url)
);

GRANT SELECT ON public.oe_surfaces TO authenticated;
GRANT ALL ON public.oe_surfaces TO service_role;

ALTER TABLE public.oe_surfaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oe_surfaces admin read" ON public.oe_surfaces
FOR SELECT TO authenticated
USING (is_current_user_admin());

CREATE INDEX oe_surfaces_due_idx ON public.oe_surfaces (terms_ok, cadence, last_harvested_at);
CREATE INDEX oe_surfaces_entity_idx ON public.oe_surfaces (entity_id);

CREATE TRIGGER oe_surfaces_updated_at
BEFORE UPDATE ON public.oe_surfaces
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.oe_entities DROP CONSTRAINT oe_entities_entity_kind_check;
ALTER TABLE public.oe_entities ADD CONSTRAINT oe_entities_entity_kind_check
  CHECK (entity_kind = ANY (ARRAY['listed','private','government','giga_project','university','regulator','ngo','other','media','consultancy','association','platform','event_organiser']));