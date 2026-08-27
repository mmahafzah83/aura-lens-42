CREATE TABLE public.product_facts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  body text not null,
  category text not null check (category in ('surface','score','capability','limit')),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.product_facts TO authenticated;
GRANT ALL ON public.product_facts TO service_role;

ALTER TABLE public.product_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read active product facts"
  ON public.product_facts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin only insert"
  ON public.product_facts FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());
CREATE POLICY "Admin only update"
  ON public.product_facts FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
CREATE POLICY "Admin only delete"
  ON public.product_facts FOR DELETE TO authenticated USING (is_current_user_admin());

CREATE TRIGGER product_facts_updated_at
  BEFORE UPDATE ON public.product_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.product_facts (key, title, body, category, sort_order) VALUES
 ('surface_capture','Capture','Capture adds a source to the vault. It is the only thing that moves capture consistency.','surface',10),
 ('surface_signals','Signals','Signals is where strategic signals are read. A signal stays open until it is used or dismissed.','surface',20),
 ('surface_write','Write','Write turns a signal or a capture into a draft. Drafting is what moves the content part of the score.','surface',30),
 ('surface_publish','Publish','Publish puts a draft out. Publishing is the only thing that generates engagement metrics.','surface',40),
 ('surface_standing','Where you stand','Where you stand shows the score and its parts, and the capability read.','surface',50),
 ('score_signal','Score: Signal','Signal is 40 percent of the score. It reflects how much strategic signal the account is carrying and using.','score',60),
 ('score_content','Score: Content','Content is 40 percent of the score. It reflects drafting and publishing.','score',70),
 ('score_capture_consistency','Score: Capture consistency','Capture consistency is 20 percent of the score. It measures weekly rhythm, not volume: a capture in a week counts once, and a hundred captures in one week do not beat one capture a week for eight weeks.','score',80),
 ('capability_save_draft','I can save a draft','I can write a draft and save it to your drafts. You open it in Publish and it is yours to edit.','capability',90),
 ('capability_set_reminder','I can set a reminder','I can set an in-app reminder for a date you name, up to thirty days out.','capability',100),
 ('capability_open_surface','I can open a surface','I can point you at the surface that holds the answer: Capture, Signals, Write, Publish or Where you stand.','capability',110),
 ('capability_search_vault','I can search your vault','I can search your own captures, documents, evidence and signals, and cite what I found.','capability',120),
 ('limit_no_linkedin_post','I cannot post to LinkedIn','I cannot post, schedule or send anything to LinkedIn on your behalf. You publish it yourself.','limit',130),
 ('limit_no_email','I cannot send email','I cannot send email or message anyone for you.','limit',140),
 ('limit_no_open_web','I cannot see the open web','I can only see your own graph: your captures, signals, documents and posts. I cannot see the open web, your network, or what anyone else has published.','limit',150);