REVOKE EXECUTE ON FUNCTION public.oe_app_queue() FROM anon;
REVOKE EXECUTE ON FUNCTION public.oe_app_render(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.oe_app_decide(uuid,text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.oe_app_proposal(uuid,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.oe_app_show_anyway(uuid) FROM anon;