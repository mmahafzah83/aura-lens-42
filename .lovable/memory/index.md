# Project Memory

## Core
Dark theme, Apple-like minimal. Primary #3B82F6, bg #0F172A.
SF Pro Display headings, Inter body. Never serif.
Mobile-first: no horizontal scroll, stacked layouts <768px, flex-wrap all action rows.
Aura app: EY Director executive coaching tool with bilingual AR/EN support.

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
- [Mobile-first responsive](mem://features/mobile-first) — Layout rules: clamp typography, responsive grids, stacked cards
- [Action system](mem://features/action-system) — Canonical action buttons for Signal/Insight/Framework/Content
- [Aura system prompt](mem://features/aura-system-prompt) — Multi-tool orchestration: Claude/Gemini/Canva
- [Executive diagnostic](mem://features/executive-diagnostic) — Onboarding flow
- [Framework diagrams](mem://features/framework-diagrams) — Visual framework generation
- [Intelligence layer](mem://features/intelligence-layer) — Evidence pipeline and pattern detection
