REVOKE EXECUTE ON FUNCTION public.oe_direction_save(text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_direction_save(text,text,boolean,text) TO authenticated;