---
name: signals-decision-engine
description: Signal Engine pipeline (Exa → Firecrawl → clean → score → AI synth). Stores content_raw + content_clean; final_score = validation*0.5 + relevance*0.3 + content_quality*0.2.
type: feature
---

Trends are Signal Objects with action_recommendation, content_angle, decision_label.

Pipeline: Exa neural discovery (research-paper category, trusted domains) → preflight HEAD → Firecrawl scrape → **content cleaning** → validation/scoring → adaptive selection (floors 60/50/40, min 3) → AI synthesis (Gemini 2.5 Flash) → insert.

Cleaning pipeline (`cleanArticleMarkdown`):
- Strips trailing sections (References, Bibliography, Notes, Appendix, etc.) once they appear past 40% of the doc.
- Drops noise lines: nav text ("Skip to main content"), cookie banners, "Subscribe", "Sign in", figure/table captions, ALL-CAPS short lines, citation markers `[1]`, MathJax `\(...\)` / `$$...$$`, script tags.
- Dedupes consecutive identical paragraphs, normalizes whitespace.

Hard rejection rules (before scoring): cleaned text < 800 chars, noise_ratio > 30%, validation_score == 0, blocked phrases.

Stores both `content_raw` (original markdown) and `content_clean` (cleaned). `content_markdown` mirrors clean for backward-compat. AI synthesis uses CLEAN only.

Scoring: `final_score = validation_score*0.5 + topic_relevance_score*0.3 + content_quality_score*0.2`. content_quality_score (0-100) = length + paragraph structure + readability (avg sentence length 12-28 words) + signal density (clean/raw ratio).

TrendDetail UI: snapshot defaults to cleaned view; "View clean" / "View raw" toggle shown when both differ. Legacy rows (no snapshot) show "Legacy signal · incomplete" panel.
