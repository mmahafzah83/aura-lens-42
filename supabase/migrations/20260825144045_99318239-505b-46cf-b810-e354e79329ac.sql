-- Discovery is retired: it produced Google search-result snippets, not real
-- posts (119 junk rows). Rows are deliberately left in place; only the machines
-- that make more are stopped.
--
-- TO RE-ENABLE:
--   SELECT cron.alter_job(jobid, active := true) FROM cron.job
--    WHERE jobname IN ('daily-linkedin-post-discovery','linkedin-retry-discovery');
SELECT cron.alter_job(jobid, active := false)
  FROM cron.job
 WHERE jobname IN ('daily-linkedin-post-discovery', 'linkedin-retry-discovery');