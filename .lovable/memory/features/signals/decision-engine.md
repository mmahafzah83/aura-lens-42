---
name: signals-decision-engine
description: Signal Engine pipeline (Exa discovery → Firecrawl → strict 6-stage extraction → AI synth). Stages: line-scored start detection, section-aware extraction, hard rejection, business relevance filter, strict insight openers.
type: feature
---

Trends are Signal Objects with action_recommendation, content_angle, decision_label.

Pipeline: Exa neural discovery (2 passes) → preflight HEAD → Firecrawl scrape → **6-stage extraction** → adaptive selection (floors 60/50/40, min 3) → AI synthesis (Gemini 2.5 Flash) → insert.

**Stage 1 — Article start detection** (`detectArticleStart` + `scoreLine`):
Each line scored: +3 full sentence (>100ch + punctuation), +2 verbs (is/are/will/enables/drives/improves/reveals/finds…), +2 business terms (strategy/transformation/efficiency/regulation/AI…), -3 nav words (skip/download/share/subscribe/login/view pdf/thank you for visiting), -2 short (<40ch), -2 ALL CAPS. Article starts at the first 3-line window where cumulative score ≥4 (or any single line ≥5). Everything before is dropped.

**Stage 2 — Section-aware extraction** (`sectionAwareExtract`):
- Scientific domains (nature/science/sciencedirect/springer/wiley/nih/arxiv/nber/cell/lancet/nejm/plos/mdpi/frontiers/ieee/acm/biorxiv): keep ONLY Abstract, Summary, Introduction, Background, Results, Findings, Discussion, Conclusions, Implications. Drop References/Bibliography/Citations/Author info/Affiliations/Acknowledgements/Funding/Data availability/Supplementary/Appendix/Cite/Metrics/Peer review/Ethics.
- Business domains: drop Related/More from/Newsletter/Subscribe/Footer/Comments/Share/About author/Tags blocks.

**Stage 3 — Hard rejection** (`openingLooksLikeArticle` + `passesBusinessRelevance` + base gates):
- cleaned text < 800 chars → reject
- noise_ratio > 30% → reject
- 2+ system phrases in first 500 chars → reject (`chrome_in_opening`)
- no full sentence in first 800 chars → reject
- first paragraph scoreLine < 3 → reject (`weak_opening_paragraph`)
- descriptive company copy without analytical verb → reject (`descriptive_company_copy`)
- no analytical verb (finds/shows/indicates/reveals/argues/concludes/estimates/projects/warns/demonstrates/exposes) AND no number/percentage in first 4000 chars → reject

Cleaning helpers retained: `unwrapMarkdownArtifacts` strips link/image wrappers BEFORE noise matching; `stripTrailingSections` cuts at References/Metrics/etc past 35% of doc; noise lines (cookie banners, ALL-CAPS short, citation markers `[1]`, MathJax `\(...\)` / `$$...$$`, script tags) dropped anywhere; consecutive duplicate paragraphs deduped; cleaning runs `stripLeadingChrome` again after section extraction.

Stores both `content_raw` (original) and `content_clean` (cleaned). `content_markdown` mirrors clean. AI synthesis uses CLEAN only.

Scoring: `final_score = validation_score*0.5 + topic_relevance_score*0.3 + content_quality_score*0.2`.

Diversity: per-domain cap 2 AND per-domain-family cap 2. Families: nature/science/springer/elsevier + mckinsey/bcg/deloitte/ey/pwc/kpmg/accenture.

**Stage 6 — Signal generation** (AI prompt + post-validator):
- `insight` MUST start with EXACTLY one of: "This signals", "This indicates", "This exposes a gap", "This creates an opportunity". Banned openers (highlights/discusses/article/according to/the report/sets a precedent) are auto-rewritten by stripping the banned head and prepending an allowed opener (chosen by impact_level/opportunity_type).
- `action_recommendation` must contain audience + concrete verb + business value.
- `content_angle` must be specific/sharp/engaging — preferably contrarian or counted.

TrendDetail UI: defaults to cleaned view; clean/raw toggle when both differ. Legacy rows (no snapshot) show "Legacy signal · incomplete" panel.
