-- Hybrid retrieval for one face: full text and vector, fused with Reciprocal
-- Rank Fusion (k = 50), in the two-CTE + full outer join shape.
create or replace function public.oe_candidates(p_user_id uuid, p_face text, p_k int)
returns table (opportunity_id uuid, rrf_score double precision, fts_rank int, vec_rank int)
language sql
stable
security definer
set search_path = public
as $$
with face as (
  select f.keywords, f.embedding
  from public.oe_faces f
  where f.user_id = p_user_id and f.face = p_face
  limit 1
),
q as (
  select coalesce(array_to_string((select keywords from face), ' or '), '') as qtext
),
live as (
  select o.id, o.tsv, o.embedding
  from public.oe_opportunities o
  where o.alive
    and (o.deadline is null or o.deadline >= current_date)
    and (o.time_kind = 'early_signal' or o.deadline is null or o.deadline >= current_date + 2)
),
fts as (
  select l.id,
         row_number() over (order by ts_rank_cd(l.tsv, websearch_to_tsquery('simple', (select qtext from q))) desc) as rank_ix
  from live l
  where (select qtext from q) <> ''
    and l.tsv @@ websearch_to_tsquery('simple', (select qtext from q))
  limit greatest(p_k, 1) * 2
),
vec as (
  select l.id,
         row_number() over (order by l.embedding <=> (select embedding from face)) as rank_ix
  from live l
  where l.embedding is not null and (select embedding from face) is not null
  limit greatest(p_k, 1) * 2
)
select coalesce(fts.id, vec.id) as opportunity_id,
       coalesce(1.0 / (50 + fts.rank_ix), 0.0) + coalesce(1.0 / (50 + vec.rank_ix), 0.0) as rrf_score,
       fts.rank_ix::int as fts_rank,
       vec.rank_ix::int as vec_rank
from fts
full outer join vec on fts.id = vec.id
order by 2 desc
limit greatest(p_k, 1);
$$;

revoke all on function public.oe_candidates(uuid, text, int) from public, anon, authenticated;
grant execute on function public.oe_candidates(uuid, text, int) to service_role;

-- Nightly: queue the judge for every consenting member with a full picture.
select cron.schedule(
  'oe-enqueue-judging-daily',
  '30 0 * * *',
  $$
  select net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-enqueue-judging',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
