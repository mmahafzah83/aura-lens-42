-- 1. Create the table
CREATE TABLE public.guide_articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  tab             text NOT NULL,
  category        text NOT NULL,
  question_en     text,
  answer_en       text NOT NULL,
  formula_note_en text,
  related_terms   text[] NOT NULL DEFAULT '{}',
  surfaces        text[] NOT NULL DEFAULT '{}',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX guide_articles_tab_sort_idx ON public.guide_articles (tab, sort_order);

-- 3. GRANTs (read-only for authenticated; full for service_role; no anon since policy gates to authenticated)
GRANT SELECT ON public.guide_articles TO authenticated;
GRANT ALL ON public.guide_articles TO service_role;

-- 4. Enable RLS
ALTER TABLE public.guide_articles ENABLE ROW LEVEL SECURITY;

-- 5. Policies — authenticated read only; writes denied (no insert/update/delete policy)
CREATE POLICY "Authenticated users can read guide articles"
  ON public.guide_articles
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. updated_at trigger
CREATE TRIGGER update_guide_articles_updated_at
  BEFORE UPDATE ON public.guide_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Seed 32 rows
INSERT INTO public.guide_articles (slug, tab, category, question_en, answer_en, formula_note_en, related_terms, surfaces, sort_order) VALUES
-- getting-started (3)
('what-is-aura', 'general', 'getting-started',
 'What is Aura?',
 'Aura turns your expertise into presence. Every week you read, think, and form clear opinions. But most of this stays in your head, and your market never sees it. Aura saves your thinking and helps you share it. So the people who matter see how you think, not only your job title. It works quietly in the background and does not add work to your week.',
 NULL, ARRAY['presence','capture','signal'], ARRAY['faq','guide'], 10),

('difference-guide-ask-aura', 'general', 'getting-started',
 'What is the difference between Guide and Ask Aura?',
 'Guide answers questions about Aura itself. For example: what a page does, how your score works, or what a word means. Ask Aura answers questions about your market and your strategy. For example: what to share this week, or what a signal means for you. Simple rule: a question about the app goes to Guide. A question about your market goes to Ask Aura.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 20),

('how-to-start', 'general', 'getting-started',
 'I just got access — where do I start?',
 'Start with one capture. Find an article, post, or report about your field, and save it to Aura. Aura reads it and turns it into a signal: a clear opinion you can share. Three captures in your first week are enough to see how Aura works. The rest grows from there.',
 NULL, ARRAY['capture','signal'], ARRAY['faq','guide'], 30),

-- tabs (5)
('tab-home', 'home', 'tabs',
 'What is the Home page for?',
 'Home is where you start each week. It shows your Digital Presence Score, your missions for the week, and a short note on what helps you most right now. Open it once at the start of the week, and you will see where to focus.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 10),

('tab-intelligence', 'intelligence', 'tabs',
 'What is the Intelligence page for?',
 'Intelligence is your radar. It shows the signals Aura built from your captures. You can see which themes you cover, where your gaps are, and what is changing in your field. This is where you decide which topic is worth your opinion.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 20),

('tab-publish', 'publish', 'tabs',
 'What is the Publish page for?',
 'Publish is where a signal becomes a post you can share. Aura writes a first draft in your own voice — a LinkedIn post, a carousel, or a short memo. It uses the thinking from your captures. You edit it, approve it, and publish it. Nothing is shared without your approval.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 30),

('tab-impact', 'impact', 'tabs',
 'What is the Impact page for?',
 'Impact shows the results of your presence in the market. It tracks how your posts perform and how your reputation grows over time. It also includes the Market Mirror: three outside views of how your market sees you today.',
 NULL, ARRAY['market-mirror'], ARRAY['faq','guide'], 40),

('tab-mystory', 'mystory', 'tabs',
 'What is the My Story page for?',
 'My Story is who you are inside Aura: your role, your field, the area you want to be known for, and your three-year goal. Aura uses this to keep every signal and post close to you. The more correct it is, the better everything Aura makes for you.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 50),

-- scoring (6)
('score-overview', 'scoring', 'scoring',
 'What is the Digital Presence Score?',
 'It is one number out of 100. It shows how visible your expertise is becoming. It goes up when you capture good sources, publish your thinking, and stay active each week. It is not an empty number. Every point comes from a real action you took to build your presence.',
 'Digital Presence Score = Signal Strength (40%) + Content Published (40%) + Weekly Rhythm (20%).',
 ARRAY['signal-strength','content-published','weekly-rhythm'], ARRAY['tooltip','faq','guide','hint'], 10),

('signal-strength', 'scoring', 'scoring',
 'What does Signal Strength measure?',
 'This measures how good and how wide your captured thinking is. It looks at how many strong signals you built, how solid they are, and how many themes they cover. Capturing different, high-quality sources raises it. It is 40% of your score.',
 NULL, ARRAY['signal','confidence-threshold','theme'], ARRAY['tooltip','faq','guide'], 20),

('content-published', 'scoring', 'scoring',
 'What does Content Published measure?',
 'This measures how much of your thinking you actually shared with the market. This means posts, carousels, and memos you approved and published. Capturing stays private. Publishing is what builds your presence. It is 40% of your score.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 30),

('weekly-rhythm', 'scoring', 'scoring',
 'What is Weekly Rhythm, and why does being regular matter more than how much you post?',
 'Weekly Rhythm rewards being active in a steady way — a little each week. This is better than posting a lot once every three months. Presence grows when people see you often, not when you post many times and then go quiet. So this measures your weekly habit, not your total number of posts. It is 20% of your score.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 40),

('why-these-weights', 'scoring', 'scoring',
 'Why is the score split 40 / 40 / 20?',
 'Because presence needs all three together. If you capture but never publish, your thinking stays hidden. So signals alone are not enough. If you publish but are not steady, people forget you fast. So content needs a regular rhythm too. The 40/40 keeps capturing and publishing equally important. The 20 keeps you regular.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 50),

('tiers', 'scoring', 'scoring',
 'What do the tiers (like Explorer) mean?',
 'Tiers show which stage you have reached as your presence grows. Explorer is the first stage. You move up as your Digital Presence Score goes up. Tiers help you see your progress quickly. They do not open or block any features.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 60),

-- terms (6)
('term-signal', 'intelligence', 'terms',
 'What is a signal?',
 'A signal is a clear opinion that you can share, built by Aura from something you captured. It is not a summary of the article. It is your own view: what the article means for your field, and why it matters now. Signals are the starting point for everything you publish.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 10),

('term-capture', 'general', 'terms',
 'What does "capture" mean?',
 'Capturing means saving something to Aura: an article link, a post, or your own notes. Aura reads it and pulls out the main thinking inside it. It takes only a few seconds and stays fully private. Nothing from a capture is published until you choose to.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 20),

('term-confidence-threshold', 'intelligence', 'terms',
 'What is the confidence threshold?',
 'Aura checks how strong the support behind each signal is. When a signal has enough support — usually from more than one capture on the same theme — it passes the confidence threshold and becomes ready to publish. If a signal is just below this line, one more related capture is usually enough to pass it.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 30),

('term-theme', 'intelligence', 'terms',
 'What is a theme?',
 'A theme is a topic where you build your presence — for example, one part of your field. Aura groups your signals by theme. This helps you see where you are strong and where you are weak. It is better to cover a few themes well than to spread across many.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 40),

('term-market-mirror', 'impact', 'terms',
 'What is the Market Mirror?',
 'The Market Mirror shows how your market probably sees you today. It uses three outside views that match your level — for example, how a client, a colleague, and an analyst would describe you. It helps you see the gap between how people see you now and how you want to be seen.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 50),

('term-voice-training', 'publish', 'terms',
 'What does "train your voice" mean?',
 'When you paste two posts you wrote before, Aura learns your tone, rhythm, and word choice. Then the drafts it writes sound like you, not like a machine. Two good examples are enough to start. You can add more anytime to make the match even better.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 60),

('term-missions', 'home', 'terms',
 'What are "this week''s missions"?',
 'Missions are the two or three most useful actions for your week. Usually one capture, one post, and one that improves your setup. Aura chooses them to raise your score where it matters most right now. Doing them is the easiest way to make steady progress.',
 NULL, ARRAY[]::text[], ARRAY['tooltip','faq','guide'], 70),

-- how-to (4)
('howto-capture', 'general', 'how-to',
 'How do I capture something?',
 'Use the Capture button in the side menu. Paste a link to an article or post, or type your own notes, then save. Aura reads it and builds a signal in a moment. Capture anything that gave you a useful idea this week.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 10),

('howto-publish', 'publish', 'how-to',
 'How do I publish a post?',
 'Open Publish and pick a signal that is ready. Aura writes a post in your own voice. Change anything you want, then approve it. Aura gets it ready for LinkedIn. You do the final post on LinkedIn yourself, so you stay in full control of what is shared in your name.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 20),

('howto-improve-score', 'scoring', 'how-to',
 'How do I raise my score fastest?',
 'Look at your three parts on Home and find the lowest one. That is the fastest way to grow. If Signal is low, capture more sources of different types. If Content is low, publish a signal that is ready. If Rhythm is low, just be active this week. Home tells you which part matters most right now.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 30),

('howto-privacy', 'general', 'how-to',
 'Is what I capture private?',
 'Yes. Your captures and signals belong only to you, and are never shared. Nothing reaches your audience unless you write it, approve it, and publish it yourself. Aura works in private. You decide what becomes public.',
 NULL, ARRAY[]::text[], ARRAY['faq','guide'], 40),

-- hint (7)
('home-score', 'home', 'hint',
 NULL,
 'This is your Digital Presence Score. It is one number out of 100 that grows as you capture, publish, and stay active. Tap the ? next to it anytime to see the details.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 10),

('home-missions', 'home', 'hint',
 NULL,
 'These are your missions for the week. They are the few actions that grow your presence most right now. Doing them is the easiest next step.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 20),

('mystory-profile', 'mystory', 'hint',
 NULL,
 'This is how Aura sees you. The more correct your details here, the better every signal and post Aura builds.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 30),

('intel-radar', 'intelligence', 'hint',
 NULL,
 'Your radar shows which themes you cover and where your gaps are. Weak areas are your next chances to grow.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 40),

('intel-signals', 'intelligence', 'hint',
 NULL,
 'These are your signals — the opinions you can share. The ones marked ready have passed the confidence threshold.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 50),

('publish-create', 'publish', 'hint',
 NULL,
 'Pick a signal that is ready, and Aura writes a post in your own voice. You edit it and approve it. Nothing is published without you.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 60),

('impact-score', 'impact', 'hint',
 NULL,
 'This is where you see what your presence is doing in the market over time, and where it is heading.',
 NULL, ARRAY[]::text[], ARRAY['hint'], 70);