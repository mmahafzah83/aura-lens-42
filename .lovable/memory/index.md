Aura app: EY Director executive coaching tool with bilingual AR/EN support, dark theme, gold accents.

## Skill Pillars
Dynamic from Executive Diagnostic (fallback: C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency)

## DB Schema
- entries: `pinned`, `image_url`, `framework_tag`, `embedding`
- diagnostic_profiles: firm, level, core_practice, sector_focus, north_star_goal, generated_skills, skill_ratings
- learned_intelligence: extracted frameworks/insights with skill_pillars, skill_boost_pct, embedding, tsv
- storage bucket: `capture-images` (public)

## Edge Functions
- summarize-link, draft-post, transcribe-voice, analyze-potential, analyze-image
- generate-skill-profile: AI-generated top 10 skills from diagnostic
- deconstruct-upload: extracts intelligence from every capture
- sovereign-reading-list: AI reading recommendations based on skill gaps
- extract-framework, generate-embedding, chat-aura, ingest-document

## Autonomous Learning Vault
- Every capture auto-deconstructed into learned_intelligence
- Intelligence boosts Skill Radar percentages (+1-5% per extraction)
- search_vault includes learned_intelligence for Ask Aura RAG
- Sovereign Reading List in Growth tab targets largest skill gaps

## Design
- RTL support via dir="auto" on all text
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived
