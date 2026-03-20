Aura app: EY Director executive coaching tool, English-only, premium dark theme.

## Design System (v2 — Premium Revamp)
- Background: #0A0A0A (0 0% 4%), Cards: 0 0% 7%
- Glassmorphism 2.0: backdrop-blur(16px), border 0.5px gold/8%, subtle white gradient overlays
- Typography: Playfair Display for h1-h3, Inter for body/h4-h6
- Gold accent: HSL 43 72% 52%, gradients for text
- Animations: tab-enter, fade-in with blur, hover-lift translateY(-2px)
- Mobile: floating glass-island nav dock, rounded-2xl
- Spacing: generous — p-8/p-10/p-12, gap-8, mb-8

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema
- entries: pinned, image_url, embedding (vector), framework_tag, account_name
- master_frameworks: expert system rules storage
- storage buckets: capture-images (public), documents (private)

## Edge Functions
- draft-post: 2-pass (draft + self-correction audit against master_frameworks)
- extract-framework, chat-aura, summarize-link, transcribe-voice, analyze-potential, analyze-image, ingest-document, generate-embedding, deduplicate-entries, account-brief

## Design Rules
- Entries >30 days without pin → archived
- No Arabic/RTL — English only
- tactile-press (scale 0.96) on all interactive elements
