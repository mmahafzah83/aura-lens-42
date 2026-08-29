create or replace function public.guard_profile_billing_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_user = 'service_role' or auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  new.plan := old.plan;
  new.tier := old.tier;
  new.account_type := old.account_type;
  new.trial_ends_at := old.trial_ends_at;
  new.plan_source := old.plan_source;
  new.excluded_reason := old.excluded_reason;
  return new;
end;
$$;

drop trigger if exists diagnostic_profiles_guard_billing on public.diagnostic_profiles;

create trigger diagnostic_profiles_guard_billing
  before update on public.diagnostic_profiles
  for each row execute function public.guard_profile_billing_columns();