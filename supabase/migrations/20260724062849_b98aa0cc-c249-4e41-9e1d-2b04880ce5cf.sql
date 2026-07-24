ALTER TABLE public.ef_event_log RENAME TO ef_event_log_retired_20260724;

INSERT INTO public.known_issues (severity, area, status, resolved_at, title, detail)
VALUES (
  'medium',
  'monitoring',
  'resolved',
  now(),
  'Monitoring substrate was split across ef_error_log and ef_event_log',
  'aura-ops-report wrote its heartbeat to one table while reading the other, producing false mute counts. reap-stuck-jobs dual-wrote to both, masking the divergence. Consolidated onto ef_error_log; ef_event_log renamed to ef_event_log_retired_20260724.'
);

INSERT INTO public.known_issues (severity, area, status, title, trigger_note)
VALUES (
  'low',
  'monitoring',
  'open',
  'ef_error_log is misnamed — it stores info heartbeats, not just errors',
  'Rename to ef_event_log properly when there is a calm window; requires updating ~11 functions.'
);