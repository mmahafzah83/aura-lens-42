CREATE TABLE IF NOT EXISTS public.oe_eligibility (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nationality text,
  residence_country text,
  countries_allowed text[],
  remote_ok boolean NOT NULL DEFAULT false,
  level_now text,
  level_ceiling text,
  level_floor text,
  chair_types_never_held text[],
  chair_types_blocked text[],
  blocked_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  sectors_core text[],
  stated_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_eligibility TO authenticated;
GRANT ALL ON public.oe_eligibility TO service_role;

ALTER TABLE public.oe_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oe_eligibility_owner_select" ON public.oe_eligibility
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "oe_eligibility_owner_insert" ON public.oe_eligibility
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "oe_eligibility_owner_update" ON public.oe_eligibility
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER oe_eligibility_touch
  BEFORE UPDATE ON public.oe_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS lane_final text,
  ADD COLUMN IF NOT EXISTS eligibility_fail text[];

CREATE INDEX IF NOT EXISTS oe_opportunities_lane_final_idx
  ON public.oe_opportunities (lane_final) WHERE alive;

ALTER TABLE public.oe_vocabulary DROP CONSTRAINT IF EXISTS oe_vocabulary_kind_check;
ALTER TABLE public.oe_vocabulary ADD CONSTRAINT oe_vocabulary_kind_check
  CHECK (kind = ANY (ARRAY['chair','lane','label','action','state','level','eligibility']));

INSERT INTO public.oe_vocabulary (key, kind, en, ar) VALUES
  ('level_ic',              'level', 'Individual contributor', 'مساهم فردي'),
  ('level_manager',         'level', 'Manager', 'مدير'),
  ('level_senior_manager',  'level', 'Senior manager', 'مدير أول'),
  ('level_director',        'level', 'Director', 'مدير تنفيذي'),
  ('level_senior_director', 'level', 'Senior director', 'مدير تنفيذي أول'),
  ('level_vp',              'level', 'Vice president', 'نائب رئيس'),
  ('level_c_suite',         'level', 'Executive leadership', 'الإدارة العليا'),
  ('level_board',           'level', 'Board', 'مجلس إدارة'),
  ('lane_act',              'lane',  'Something to act on', 'شيء للتحرّك عليه'),
  ('lane_write',            'lane',  'Something worth writing about', 'شيء يستحق الكتابة عنه'),
  ('nothing_to_act_on',     'lane',  'Nothing to act on today. One thing worth writing about.', 'لا شيء للتحرّك عليه اليوم. شيء واحد يستحق الكتابة عنه.'),
  ('what_you_can_hold',     'eligibility', 'What you can hold', 'ما يمكنك شغله'),
  ('closed_to_you',         'eligibility', 'Closed to you', 'مغلق أمامك'),
  ('thats_changed',         'eligibility', 'That''s changed', 'تغيّر هذا'),
  ('fail_place',            'eligibility', 'Outside where you can work', 'خارج نطاق عملك'),
  ('fail_place_unknown',    'eligibility', 'Place not stated', 'المكان غير محدد'),
  ('fail_chair',            'eligibility', 'A seat closed to you', 'مقعد مغلق أمامك'),
  ('fail_level',            'eligibility', 'Outside your level range', 'خارج نطاق مستواك'),
  ('fail_requirement',      'eligibility', 'Asks for something you cannot meet', 'يطلب ما لا يمكنك استيفاؤه'),
  ('what_happened',         'lane',  'What happened', 'ما الذي حدث'),
  ('why_it_matters',        'lane',  'Why it matters in your sector', 'لماذا يهم في قطاعك'),
  ('what_you_know',         'lane',  'What you know that the coverage does not', 'ما تعرفه ولا تقوله التغطية'),
  ('open_with',             'lane',  'The question you could open with', 'السؤال الذي يمكنك أن تبدأ به')
ON CONFLICT (key) DO UPDATE SET en = EXCLUDED.en, ar = EXCLUDED.ar, kind = EXCLUDED.kind;

INSERT INTO public.oe_eligibility (
  user_id, nationality, residence_country, countries_allowed, remote_ok,
  level_now, level_ceiling, level_floor,
  chair_types_never_held, chair_types_blocked, blocked_reasons,
  sectors_core, stated_rules
) VALUES (
  '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3',
  'JO', 'SA', ARRAY['SA'], false,
  'director', 'senior_director', 'senior_manager',
  ARRAY['board'], ARRAY['board'],
  '{"board":"Saudi listed-company board seats require Saudi nationals; no prior board service"}'::jsonb,
  ARRAY['government','utilities_water','logistics','public_sector','digital_transformation'],
  '[{"said_on":"2026-09-18","text":"I can''t be on boards, because it needs Saudi nationals, I didn''t have the experience before, it''s not linked to my career or brand.","applies_to":"chair:board"},
    {"said_on":"2026-09-18","text":"I''m not yet a CEO level — this we should check previous rules, previous experience, capability, nationality, requirements, acceptance criteria.","applies_to":"level:c_suite"},
    {"said_on":"2026-09-18","text":"It''s a news… mostly just write a post about it maybe.","applies_to":"lane:write"}]'::jsonb
) ON CONFLICT (user_id) DO NOTHING;