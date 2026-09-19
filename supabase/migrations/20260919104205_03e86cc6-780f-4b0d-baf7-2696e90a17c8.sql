ALTER TABLE public.oe_notebook DROP CONSTRAINT oe_notebook_origin_check;
ALTER TABLE public.oe_notebook ADD CONSTRAINT oe_notebook_origin_check
  CHECK (origin = ANY (ARRAY['stated'::text, 'signed'::text, 'derived'::text]));
ALTER TABLE public.oe_notebook DROP CONSTRAINT oe_notebook_op_check;
ALTER TABLE public.oe_notebook ADD CONSTRAINT oe_notebook_op_check
  CHECK (op = ANY (ARRAY['exclude'::text, 'prefer'::text, 'require'::text, 'never_held'::text]));