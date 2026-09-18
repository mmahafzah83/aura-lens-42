ALTER TABLE public.oe_opportunities ALTER COLUMN route_kind SET DEFAULT 'not_checked';
UPDATE public.oe_opportunities SET route_kind = 'not_checked' WHERE route_kind IS NULL;