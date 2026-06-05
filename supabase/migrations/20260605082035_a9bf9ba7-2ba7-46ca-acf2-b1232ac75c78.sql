
-- UPDATES
UPDATE public.guide_articles SET
  question_en = 'What is the Home tab?',
  answer_en = E'Home is your weekly starting point. It shows your Digital Presence Score, This Week''s Rhythm, and "Your week, ready" — three drafts prepared from your strongest signals every Monday morning. Review them, make them yours, and ship. Most weeks, Home is the only tab you need.',
  updated_at = now()
WHERE slug = 'tab-home';

UPDATE public.guide_articles SET
  question_en = E'What is This Week''s Rhythm?',
  answer_en = E'This Week''s Rhythm shows the few actions that matter most this week — usually one capture, one post, one refinement. Items tick themselves off as you work; there are no points and no streaks. It''s a pulse, not a chore list.',
  updated_at = now()
WHERE slug = 'term-missions';

UPDATE public.guide_articles SET
  question_en = 'How does Aura learn my voice?',
  answer_en = E'Aura learns your voice in Arabic and English separately. Your voice card shows a signature for each language — the العربية and English tabs — with a ✦ on your primary voice, the language you publish in most.\n\nThree things shape it:\n\nYour published posts. Aura reads your recent posts and distills how you actually write — your tone, your signature phrases, the words you keep out.\n\nTeaching. Paste a few of your best posts into "Teach Aura your writing" (separate each with --- on its own line) or upload a .txt file. Aura detects each post''s language and files it on the right side.\n\nYour edits. The signature line on the card is yours: edit it once and Aura never overwrites it. Sharpening refreshes the phrases and patterns around it.\n\n"اشحذها الآن" (Sharpen now) rebuilds the signature for the tab you''re on, from that language''s posts only. And if your posting mix changes enough that your primary voice switches, Aura tells you on the card — never silently.',
  updated_at = now()
WHERE slug = 'how-aura-learns-voice';

UPDATE public.guide_articles SET
  question_en = 'How do I publish a post?',
  answer_en = E'Open a draft, make it yours, then Mark as published. Aura asks for the post''s LinkedIn link — optional, but pasting it lets Aura track how the post performs and learn from it. Published posts move to your Library under Published, and their engagement feeds your score.',
  updated_at = now()
WHERE slug = 'howto-publish';

UPDATE public.guide_articles SET
  question_en = 'What is Market Mirror?',
  answer_en = E'Market Mirror shows how three audiences that matter at your rank read your presence — for a Director: headhunters, CIOs, and curators; for a Partner: clients, your practice, and talent; for the C-suite: boards, peers, and analysts. It refreshes as your signals and posts evolve.',
  updated_at = now()
WHERE slug = 'term-market-mirror';

UPDATE public.guide_articles SET
  question_en = 'What is voice training?',
  answer_en = E'Voice training is how Aura learns to write like you, not like AI. It draws from your published posts, anything you teach it, and your own edits. Train it once, then refine: the more real posts it sees, the closer the match.',
  updated_at = now()
WHERE slug = 'term-voice-training';

-- INSERTS
INSERT INTO public.guide_articles (slug, tab, category, surfaces, sort_order, question_en, answer_en) VALUES
('your-week-ready', 'home', 'how-to', ARRAY['faq','guide'], 20,
  'What is "Your week, ready"?',
  E'Every Monday morning, Aura prepares three drafts from your strongest signals — in the languages you actually publish in — and places them on Home. Review each one, edit until it sounds like you, and ship. The counter tracks your week: three shipped is a strong rhythm.'),

('howto-edit-drafts', 'publish', 'how-to', ARRAY['faq','guide'], 25,
  'How do I edit a draft?',
  E'Open any draft — from Home''s weekly card or the Library pencil — and it loads in Create. Tap the pencil on the preview to edit the text directly, then Done and Save draft. Your edit is saved to the same draft, and the preview updates everywhere it appears.'),

('term-primary-voice', 'mystory', 'terms', ARRAY['faq','guide'], 60,
  'What does "primary voice" mean?',
  E'Your primary voice is the language Aura writes in by default — marked with ✦ on your voice card. It''s set by your recent posts, not by a setting: publish mostly in Arabic, and Arabic leads. If it ever changes, Aura tells you on the card.'),

('howto-settings', 'settings', 'how-to', ARRAY['faq','guide'], 10,
  'What can I manage in Settings?',
  E'Settings holds your account, appearance, and notification preferences, plus your data controls — including export and deletion. It''s also where you''ll find a link to this guide.'),

('identity-report', 'settings', 'how-to', ARRAY['faq','guide'], 80,
  'What is the Strategic Identity Report?',
  E'A branded PDF of your professional identity: your score and how it''s built, your strongest signals, and how the market reads you. Export it from Settings and use it where presence matters — before a panel, a board introduction, or a search conversation.'),

('howto-ask-aura', 'general', 'how-to', ARRAY['faq','guide'], 50,
  'How do I use Ask Aura?',
  E'Ask Aura is your chief of staff. Ask it anything about your signals, your market, or your next move — or use the quick actions: LinkedIn Post, Identify Gaps, Draft Memo, Meeting Prep, Draft Deck, Synthesize, and Market Mirror. Every answer is grounded in your own signals and ends with a next step.'),

('tip-separate-posts', 'general', 'tips', ARRAY['faq','guide'], 10,
  'Teaching several posts at once',
  E'When pasting more than one post into "Teach Aura your writing", put --- on its own line between posts. That''s how Aura knows where one post ends and the next begins — and files each one in the right language.'),

('tip-own-the-tone', 'general', 'tips', ARRAY['faq','guide'], 20,
  'Make the signature line yours',
  E'The signature line on your voice card is yours. Edit it once to say exactly who you are — Aura will sharpen everything around it, but it will never rewrite your words.'),

('tip-paste-the-link', 'general', 'tips', ARRAY['faq','guide'], 30,
  'Always paste the post link',
  E'After publishing on LinkedIn, paste the post''s link when you mark it published. It takes five seconds, and it lets Aura track the post and learn what works for you.'),

('tip-monday-quarter-hour', 'general', 'tips', ARRAY['faq','guide'], 40,
  'Fifteen minutes on Monday',
  E'Fifteen minutes on Monday is enough: open Home, read your three drafts, sharpen the one you like most, ship it. Consistency beats volume — the score is built that way.'),

('tip-capture-breadth', 'general', 'tips', ARRAY['faq','guide'], 50,
  'Capture from different places',
  E'Signals grow from breadth and depth: a few capture entries from different organizations beat many from the same one. When something makes you think, capture it — Aura does the connecting.'),

('faq-draft-languages', 'publish', 'how-to', ARRAY['faq','guide'], 28,
  'Why are my weekly drafts in Arabic and English?',
  E'The mix follows your behavior. Aura looks at your last 30 posts: your main language fills most slots, and your second language earns one when it''s at least a quarter of what you publish. Change what you post, and the mix follows.'),

('faq-primary-changed', 'mystory', 'how-to', ARRAY['faq','guide'], 58,
  'Why did my primary voice change?',
  E'Because your recent posts changed. Primary voice follows what you actually publish. When it switches, Aura posts a notice on your voice card — dismiss it once you''ve seen it. Your signatures for both languages are kept either way.'),

('faq-delete-capture', 'intelligence', 'how-to', ARRAY['faq','guide'], 60,
  'What happens if I delete a capture entry?',
  E'Its evidence is removed and any signal that referenced it drops that evidence and recounts. Signals supported by your other entries stay; nothing else is touched.');
