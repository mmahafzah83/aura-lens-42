-- ── A) THE EMPLOYER LADDER AS DATA ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oe_employer_ladder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'XX',
  band text NOT NULL CHECK (band IN ('anchor','major','local')),
  pattern text NOT NULL,
  label_en text NOT NULL,
  label_ar text,
  standing_bonus numeric NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, pattern)
);

GRANT SELECT ON public.oe_employer_ladder TO authenticated;
GRANT ALL ON public.oe_employer_ladder TO service_role;

ALTER TABLE public.oe_employer_ladder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read the employer ladder"
  ON public.oe_employer_ladder FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins maintain the employer ladder"
  ON public.oe_employer_ladder FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS oe_employer_ladder_country_idx
  ON public.oe_employer_ladder (country) WHERE active;

CREATE TRIGGER oe_employer_ladder_updated_at
  BEFORE UPDATE ON public.oe_employer_ladder
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Global rows — today's behaviour, unchanged.
INSERT INTO public.oe_employer_ladder (country, band, pattern, label_en, label_ar, standing_bonus) VALUES
('XX','anchor','mckinsey','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','bcg','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','boston consulting','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','bain (&|and) company','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','deloitte','a Big Four firm','إحدى شركات الأربعة الكبار',1.5),
('XX','anchor','pwc','a Big Four firm','إحدى شركات الأربعة الكبار',1.5),
('XX','anchor','pricewaterhouse','a Big Four firm','إحدى شركات الأربعة الكبار',1.5),
('XX','anchor','ernst.*young','a Big Four firm','إحدى شركات الأربعة الكبار',1.5),
('XX','anchor','\mey\M','a Big Four firm','إحدى شركات الأربعة الكبار',1.5),
('XX','anchor','kpmg','a Big Four firm','إحدى شركات الأربعة الكبار',1.5),
('XX','anchor','strategy&','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','oliver wyman','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','kearney','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','roland berger','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','anchor','booz','a top-tier strategy house','بيت استشارات استراتيجية من الصف الأول',1.5),
('XX','major','accenture','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','wipro','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','infosys','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','\mtcs\M','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','tata consultancy','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','capgemini','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','\mibm\M','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','cognizant','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','\mdxc\M','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','atos','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','\mntt\M','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','devoteam','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','sopra','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','fujitsu','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','\mhcl\M','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','tech mahindra','a global systems integrator','متكامل أنظمة عالمي',0.5),
('XX','major','globant','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','thoughtworks','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','slalom','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','publicis sapient','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','pa consulting','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','alvarez (&|and) marsal','a major consultancy','شركة استشارات كبرى',0.5),
('XX','major','gartner','a major research and advisory firm','شركة أبحاث واستشارات كبرى',0.5)
ON CONFLICT (country, pattern) DO NOTHING;

-- Saudi rows — where a Director seat carries national weight.
INSERT INTO public.oe_employer_ladder (country, band, pattern, label_en, label_ar, standing_bonus, notes) VALUES
('SA','anchor','aramco','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','public investment fund','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','\mpif\M','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','sabic','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','\mstc\M','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudi telecom','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','neom','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','qiddiya','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','diriyah','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','red sea global','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','roshn','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','acwa power','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','ma''?aden','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudi central bank','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','\msama\M','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,'short form — matched against employer name only'),
('SA','anchor','tadawul','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudi national bank','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','\msnb\M','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,'short form — matched against employer name only'),
('SA','anchor','al ?rajhi','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudi electricity','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudia','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudi arabian airlines','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','saudi arabia railways','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','^\s*sar\s*$','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,'whole-name only: the bare initials SAR are the railway; anywhere else they are a currency'),
('SA','anchor','health holding','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','ministry of finance','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','ministry of communications','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','ministry of human resources','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','ministry of municipal','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','anchor','\msdaia\M','a Saudi national anchor employer','جهة سعودية وطنية كبرى',1.5,NULL),
('SA','major','\melm\M','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','tahakom','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','thiqah','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','aramco digital','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','\malat\M','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','humain','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','lean business','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','nupco','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','monsha''?at','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','\mmisk\M','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','digital government authority','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','\mdga\M','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','national cybersecurity authority','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','^\s*nca\s*$','a major Saudi employer','جهة سعودية كبيرة',0.5,'whole-name only: NCA collides with ordinary abbreviations'),
('SA','major','mobily','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','zain','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','solutions by stc','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','bupa arabia','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','tawuniya','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','almarai','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','riyad bank','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','saudi awwal','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','^\s*sab\s*$','a major Saudi employer','جهة سعودية كبيرة',0.5,'whole-name only: SAB is Saudi Awwal Bank; elsewhere it is noise'),
('SA','major','alinma','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','bank albilad','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','\mbahri\M','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','tasnee','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL),
('SA','major','sipchem','a major Saudi employer','جهة سعودية كبيرة',0.5,NULL)
ON CONFLICT (country, pattern) DO NOTHING;

-- ── C) LOCATION SENSITIVITY PER KIND ──────────────────────────────────────
ALTER TABLE public.oe_opportunity_kinds
  ADD COLUMN IF NOT EXISTS location_sensitivity text NOT NULL DEFAULT 'hard'
  CHECK (location_sensitivity IN ('hard','soft','none'));

UPDATE public.oe_opportunity_kinds SET location_sensitivity = 'hard'
  WHERE code IN ('executive_role');
UPDATE public.oe_opportunity_kinds SET location_sensitivity = 'soft'
  WHERE code IN ('advisory_role','board_seat','mandate_tender','executive_teaching','investment_partnership');
UPDATE public.oe_opportunity_kinds SET location_sensitivity = 'none'
  WHERE code IN ('speaking_platform','award_judging','professional_membership','authoring_publication','market_signal');

-- ── B) THE GATE NAME MUST BE THE ACTUAL CAUSE ─────────────────────────────
ALTER TABLE public.oe_matches DROP CONSTRAINT IF EXISTS oe_matches_screen_gate_check;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_screen_gate_check
  CHECK (screen_gate IS NULL OR screen_gate = ANY (ARRAY[
    'place','nationality','licence','certification','clearance','language','other',
    'profession','level','presentation','scored'
  ]));