alter table public.oe_opportunities drop constraint if exists oe_quote_fail_reason_known;
alter table public.oe_opportunities add constraint oe_quote_fail_reason_known
  check (quote_fail_reason is null or quote_fail_reason = any (array['fetch_failed','page_changed','quote_absent','quote_not_in_text','shell_page']));