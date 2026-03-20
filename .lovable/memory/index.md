Aura app: EY Director executive coaching tool with bilingual AR/EN support, dark theme, gold accents.

## Language
- LanguageProvider in src/contexts/LanguageContext.tsx
- IBM Plex Sans Arabic font for Arabic, Inter for English, Playfair Display for EN headings
- RTL support via html dir attribute toggle
- Language preference stored in localStorage as "aura-lang"

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema Extensions
- entries: added `pinned` (bool, default false), `image_url` (text, nullable)
- storage bucket: `capture-images` (public)

## Edge Functions
- summarize-link, draft-post, transcribe-voice, analyze-potential, analyze-image, chat-aura
- draft-post supports types: voice, weekly-memo, arabic-executive, translate-executive-ar, default

## Design
- RTL support via dir="auto" on all text + global RTL toggle
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived
- Use logical CSS props (start/end/ps/pe/ms/me) for RTL compatibility
