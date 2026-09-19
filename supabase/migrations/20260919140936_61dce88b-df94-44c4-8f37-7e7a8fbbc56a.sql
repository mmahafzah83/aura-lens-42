CREATE TABLE public.oe_opportunity_kinds (
  code text PRIMARY KEY,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  detect_en text,
  detect_ar text,
  allows_opportunity_language boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_opportunity_kinds TO authenticated;
GRANT ALL ON public.oe_opportunity_kinds TO service_role;
ALTER TABLE public.oe_opportunity_kinds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in members can read the opportunity kinds"
  ON public.oe_opportunity_kinds FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_oe_opportunity_kinds_updated_at BEFORE UPDATE ON public.oe_opportunity_kinds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.oe_source_types (
  code text PRIMARY KEY,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  yields_kinds text[] NOT NULL DEFAULT '{}',
  structured boolean NOT NULL DEFAULT false,
  typical_refresh text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_source_types TO authenticated;
GRANT ALL ON public.oe_source_types TO service_role;
ALTER TABLE public.oe_source_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in members can read the source types"
  ON public.oe_source_types FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_oe_source_types_updated_at BEFORE UPDATE ON public.oe_source_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.oe_opportunities
  ADD COLUMN kind text REFERENCES public.oe_opportunity_kinds(code),
  ADD COLUMN kind_completeness jsonb;

ALTER TABLE public.oe_surfaces ADD COLUMN source_type text REFERENCES public.oe_source_types(code);
ALTER TABLE public.oe_feeds ADD COLUMN source_type text REFERENCES public.oe_source_types(code);
ALTER TABLE public.oe_feeds ADD COLUMN structured boolean;

CREATE INDEX idx_oe_opportunities_kind ON public.oe_opportunities(kind);
CREATE INDEX idx_oe_surfaces_source_type ON public.oe_surfaces(source_type);
CREATE INDEX idx_oe_feeds_source_type ON public.oe_feeds(source_type);