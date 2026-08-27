ALTER TABLE public.desk_eval_questions ADD COLUMN IF NOT EXISTS question_set text NOT NULL DEFAULT 'set_1';
ALTER TABLE public.desk_eval_runs ADD COLUMN IF NOT EXISTS axis_consistency text;
ALTER TABLE public.desk_eval_runs ADD COLUMN IF NOT EXISTS axis_asks_when_unclear text;
CREATE INDEX IF NOT EXISTS desk_eval_questions_set_idx ON public.desk_eval_questions (question_set, active);