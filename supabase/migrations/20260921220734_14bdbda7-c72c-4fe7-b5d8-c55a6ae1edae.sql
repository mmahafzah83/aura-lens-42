alter table public.oe_matches drop constraint if exists oe_matches_screen_gate_check;
alter table public.oe_matches add constraint oe_matches_screen_gate_check
  check (screen_gate is null or screen_gate = any (array['place','nationality','licence','certification','clearance','language','other','profession','level','presentation','scored','rubric']));