---
name: signals-decision-engine
description: Signal Engine pipeline (Exa 2-pass discovery → Firecrawl → clean → opening-gate → score → AI synth). Stores content_raw + content_clean; final_score = validation*0.5 + relevance*0.3 + content_quality*0.2.
type: feature
---

Trends are Signal Objects with action_recommendation, content_angle, decision_label.

Pipeline: Exa neural discovery (2 passes per query: consulting-biased + open) → preflight HEAD → Firecrawl scrape → **content cleaning** → opening-acceptance gate → validation/scoring → adaptive selection (floors 60/50/40, min 3) → AI synthesis (Gemini 2.5 Flash) → insert.

Cleaning pipeline (`cleanArticleMarkdown`):
- `unwrapMarkdownArtifacts` strips link/image/URL wrappers BEFORE noise matching, so `[Skip to main content](url)` is caught.
- `stripLeadingChrome` drops top-of-doc nav until a real sentence-like paragraph (≥120 chars + punctuation) appears.
- `stripTrailingSections` cuts at References/Bibliography/Notes/Related/About this article/Cite this article/Metrics/Author info/Acknowledgements past 35% of the doc.
- Drops noise lines anywhere: nav, cookie banners, "Subscribe", "Sign in", figure/table captions, ALL-CAPS short lines, citation markers `[1]`, MathJax `\(...\)` / `$$...$$`, script tags, journal chrome ("Thank you for visiting", "Download PDF", "you are using a browser version", "open access", "article open access").
- Two-pass clean: after wrappers are removed, re-runs noise-line check.
- Dedupes consecutive identical paragraphs, normalizes whitespace.

Opening gate (`openingLooksLikeArticle`): rejects if first 500 chars contain ≥2 noise phrases, or if no sentence-like construct appears in the first 800 chars.

Hard rejection rules: cleaned text < 800 chars, noise_ratio > 30%, validation_score == 0, blocked phrases, opening fails article-shape check.

Stores both `content_raw` (original markdown) and `content_clean` (cleaned). `content_markdown` mirrors clean for backward-compat. AI synthesis uses CLEAN only.

Scoring: `final_score = validation_score*0.5 + topic_relevance_score*0.3 + content_quality_score*0.2`. content_quality_score (0-100) = length + paragraph structure + readability (avg sentence length 12-28 words) + signal density (clean/raw ratio).

Diversity: `diversifyByDomain` enforces per-domain cap (2) AND per-domain-family cap (2). Families: nature-family (all *.nature.com), science-family, springer-family, elsevier-family, plus mckinsey/bcg/deloitte/ey/pwc/kpmg/accenture as their own families. Family cap relaxes if pool is too small but domain cap is hard.

Discovery: 2 passes per query — pass 1 restricted to consulting/business domains (Nature/NBER excluded), pass 2 open neural search. No `category: "research paper"` lock. 120-day window.

AI prompt enforces:
- insight must start with "This signals…" / "This creates an opportunity to…" / "This indicates a shift…" / "This raises the bar for…" / "This exposes a gap in…". Bans "highlights", "discusses", "sets a precedent".
- action_recommendation must name SPECIFIC audience + action + value (e.g. "Open a CFO conversation at 2 utility clients this quarter…").
- content_angle must be specific/contrarian/counted (e.g. "3 things water utility CFOs get wrong about digital twins…").

TrendDetail UI: snapshot defaults to cleaned view; "View clean" / "View raw" toggle shown when both differ. Legacy rows (no snapshot) show "Legacy signal · incomplete" panel.
