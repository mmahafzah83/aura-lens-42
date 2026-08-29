create or replace function public.touch_capability_response()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.answered_at = now();
  return new;
end;
$$;

drop trigger if exists capability_responses_touch on public.capability_responses;

create trigger capability_responses_touch
  before insert or update on public.capability_responses
  for each row execute function public.touch_capability_response();