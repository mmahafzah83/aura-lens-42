-- linkedin_read_readiness is an operations view: it lists every member's first
-- name, handle and read verdict in one place. It was readable by anon and by
-- every signed-in member, which is a cross-member leak. Only the system needs it.
REVOKE ALL ON public.linkedin_read_readiness FROM anon, authenticated;

-- morning_promise_state exposes aggregate delivery health to signed-in members
-- (Onboarding reads it). A signed-out visitor has no business with it.
REVOKE ALL ON public.morning_promise_state FROM anon;