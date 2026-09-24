create or replace function public.oe_withdraw_card_on_reject() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.screen_outcome='rejected' and old.screen_outcome is distinct from 'rejected' then
    update oe_cards c set withdrawn_at=now(),
      withdrawn_reason='no longer passes '||coalesce(new.screen_gate,'screen')||': '||coalesce(new.rejection_sentence,'')
    where c.user_id=new.user_id and c.opportunity_id=new.opportunity_id and c.withdrawn_at is null
      and not exists (select 1 from oe_taps t where t.card_id=c.id);
  end if;
  return new;
end $$;
revoke execute on function public.oe_withdraw_card_on_reject() from public, anon, authenticated;
drop trigger if exists trg_oe_withdraw_card_on_reject on public.oe_matches;
create trigger trg_oe_withdraw_card_on_reject after update of screen_outcome on public.oe_matches
for each row execute function public.oe_withdraw_card_on_reject();