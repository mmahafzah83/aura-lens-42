Aura app: EY Director executive coaching tool with bilingual AR/EN support, dark theme, gold accents.

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema Extensions
- entries: added `pinned` (bool, default false), `image_url` (text, nullable)
- linkedin_connections: OAuth tokens, connection status, linkedin_id, display_name
- storage bucket: `capture-images` (public)

## Edge Functions
- summarize-link, draft-post, transcribe-voice, analyze-potential, analyze-image
- linkedin-oauth (get-auth-url, status, disconnect), linkedin-oauth-callback, linkedin-claim, linkedin-sync

## LinkedIn OAuth
- Authorization Code Flow with openid/profile/email scopes
- Callback stores temp connection, frontend claims it via linkedin-claim
- linkedin-sync fetches profile and stores influence_snapshots
- Read-only: Aura never posts to LinkedIn

## Design
- RTL support via dir="auto" on all text
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived

## Memories
- [Aura System Prompt](mem://features/aura-system-prompt) — Multi-AI tool architecture (Claude/Perplexity/Gemini/Canva/NotebookLM), workflow pipeline, LinkedIn writing rules, content principles
- [Action System](mem://features/action-system) — Standardized button labels and action behaviors
- [Executive Diagnostic](mem://features/executive-diagnostic) — Onboarding diagnostic flow
- [Framework Diagrams](mem://features/framework-diagrams) — Visual generation system for frameworks
- [Intelligence Layer](mem://features/intelligence-layer) — Knowledge intelligence engine details
