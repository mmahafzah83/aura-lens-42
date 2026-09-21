alter view public.oe_quote_not_in_raw set (security_invoker = on);
alter view public.oe_card_cites_foreign_evidence set (security_invoker = on);
alter view public.oe_judge_disagreement set (security_invoker = on);
alter view public.oe_gate_contradiction set (security_invoker = on);
revoke execute on function public.oe_norm_text(text) from anon;
revoke execute on function public.oe_member_evidence(uuid, vector, integer) from anon;