# Memory: index.md
Updated: today

Aura app: EY Director executive coaching tool with bilingual AR/EN support, dark theme, gold accents.

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema Extensions
- entries: added `pinned` (bool, default false), `image_url` (text, nullable)
- storage bucket: `capture-images` (public)

## Edge Functions
- summarize-link, draft-post, transcribe-voice, analyze-potential, analyze-image

## Design
- RTL support via dir="auto" on all text
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived

## Memories
- [Action System](mem://features/action-system.md) — Action workspace with generate-action-output edge function
- [Aura System Prompt](mem://features/aura-system-prompt.md) — Chat-aura system prompt and persona rules
- [Executive Diagnostic](mem://features/executive-diagnostic.md) — Onboarding diagnostic flow and profile schema
- [Framework Diagrams](mem://features/framework-diagrams.md) — Framework diagram generation with regenerate-schematic
- [Mobile First](mem://features/mobile-first.md) — Mobile-first responsive design rules
- [Intelligence Layer](mem://features/intelligence-layer.md) — source_registry + evidence_fragments for structured evidence extraction
- [Influence Data Foundation](mem://features/influence-data-foundation.md) — DB schema extensions and 5 UI panels for LinkedIn authority analytics
- [Auth-ready Bootstrap](mem://technical/auth-ready-bootstrap) — useAuthReady gates page loaders; never call getUser() in loaders; wrap with withTimeout
