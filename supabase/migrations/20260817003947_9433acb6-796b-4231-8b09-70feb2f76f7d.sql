DELETE FROM public.mirror_requests r
WHERE r.created_at > now() - interval '2 hours'
  AND NOT EXISTS (SELECT 1 FROM public.mirror_reads m WHERE m.handle = r.handle);