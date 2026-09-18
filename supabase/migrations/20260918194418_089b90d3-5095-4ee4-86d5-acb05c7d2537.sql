CREATE OR REPLACE FUNCTION public.oe_normalize_terms(p_text text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token),'{}'::text[])
  FROM regexp_split_to_table(lower(regexp_replace(COALESCE(p_text,''),'[^[:alnum:]ء-ي]+',' ','g')), '[[:space:]]+') token
  WHERE length(token)>=4 AND token NOT IN ('with','from','that','this','have','will','your','into','about','their','where','which','required','requirements','experience','years','role','work','team','على','إلى','التي','الذي','هذه','هذا','خبرة','سنوات');
$$;