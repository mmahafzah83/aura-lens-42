-- The member cannot read the organisation table directly, so the names of the
-- companies he follows or hides are handed back through one narrow function.
CREATE OR REPLACE FUNCTION public.oe_ref_entity_names(p_ids uuid[])
RETURNS TABLE(id uuid, name text, sector_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT e.id, e.name, e.sector_code
  FROM oe_entities e
  WHERE auth.uid() IS NOT NULL AND e.id = ANY(coalesce(p_ids, '{}'::uuid[]))
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.oe_ref_entity_names(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_ref_entity_names(uuid[]) TO authenticated;