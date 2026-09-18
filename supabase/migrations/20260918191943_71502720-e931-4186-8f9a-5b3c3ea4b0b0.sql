CREATE OR REPLACE FUNCTION public.oe_notebook_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.origin = 'signed' AND NEW.proposal_status <> 'signed' THEN
    RAISE EXCEPTION 'a signed rule must carry proposal_status = signed';
  END IF;
  IF NEW.kind = 'hard' THEN NEW.expires_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.oe_app_proposal(p_id uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE oe_notebook SET proposal_status=CASE WHEN p_accept THEN 'signed' ELSE 'declined' END,
   origin=CASE WHEN p_accept THEN 'signed' ELSE origin END,
   active=p_accept, expires_at=CASE WHEN p_accept THEN NULL ELSE now()+interval '90 days' END
 WHERE id=p_id AND user_id=auth.uid() AND proposal_status='open';
END $$;
REVOKE ALL ON FUNCTION public.oe_app_proposal(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_app_proposal(uuid,boolean) TO authenticated, service_role;