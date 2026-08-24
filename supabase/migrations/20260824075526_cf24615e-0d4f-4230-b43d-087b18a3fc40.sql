CREATE TABLE public.theme_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical text NOT NULL,
  alias text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  source text NOT NULL DEFAULT 'seed',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias, canonical, locale)
);

GRANT SELECT ON public.theme_aliases TO authenticated;
GRANT ALL ON public.theme_aliases TO service_role;

ALTER TABLE public.theme_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theme_aliases_read_authenticated" ON public.theme_aliases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "theme_aliases_admin_insert" ON public.theme_aliases
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "theme_aliases_admin_update" ON public.theme_aliases
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "theme_aliases_admin_delete" ON public.theme_aliases
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- An alias that is itself a common English word fires on nearly every profile
-- ever written. 'information technology <-> it' is the standing example: "it"
-- is a pronoun. One alias that matches everything is worse than no alias, so
-- stopword aliases are rejected at write time as well as in the matcher.
CREATE OR REPLACE FUNCTION public.reject_stopword_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  stopwords text[] := ARRAY['of','the','and','for','in','to','a','an','on','with','it','is','at','by','as','or','from','that','this','be'];
BEGIN
  IF lower(btrim(NEW.alias)) = ANY (stopwords) THEN
    RAISE EXCEPTION 'alias "%" is a stopword and would match every profile', NEW.alias;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER theme_aliases_reject_stopword
  BEFORE INSERT OR UPDATE ON public.theme_aliases
  FOR EACH ROW EXECUTE FUNCTION public.reject_stopword_alias();

INSERT INTO public.theme_aliases (canonical, alias, locale) VALUES
  ('artificial intelligence','ai','en'),
  ('machine learning','ml','en'),
  ('generative ai','genai','en'),
  ('generative ai','gen ai','en'),
  ('large language model','llm','en'),
  ('internet of things','iot','en'),
  ('operational technology','ot','en'),
  ('robotic process automation','rpa','en'),
  ('transformation management office','tmo','en'),
  ('project management office','pmo','en'),
  ('key performance indicator','kpi','en'),
  ('return on investment','roi','en'),
  ('customer experience','cx','en'),
  ('user experience','ux','en'),
  ('enterprise resource planning','erp','en'),
  ('cybersecurity','cyber security','en'),
  ('cybersecurity','infosec','en'),
  ('environmental social governance','esg','en'),
  ('saudi arabia','ksa','en'),
  ('united arab emirates','uae','en'),
  ('public private partnership','ppp','en'),
  ('service level agreement','sla','en'),
  ('proof of concept','poc','en'),
  ('الذكاء الاصطناعي','ai','ar'),
  ('التحول الرقمي','digital transformation','ar'),
  ('الحوكمة','governance','ar'),
  ('إدارة التغيير','change management','ar');