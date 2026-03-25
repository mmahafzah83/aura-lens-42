# Aura typography & layout system. Updated: 2026-03-25

Aura app: EY Director executive coaching tool with bilingual AR/EN support, dark theme, gold accents.

## Typography Scale (MINIMUM 14px)
- H1 page title: 34px/600 Playfair Display
- H2 section title: 24px/600 Playfair Display
- H3 card title: 18px/500 Playfair Display
- Body: 16px/1.6 Inter
- Meta/supporting: 14px muted-foreground
- Labels: 14px/600 uppercase tracking-wide muted
- Metrics: 32px/600 tabular-nums

## CSS Utility Classes
- `.text-page-title`, `.text-section-title`, `.text-card-title`, `.text-body`, `.text-meta`, `.text-label`, `.text-metric`
- `.card-pad` = padding: 32px
- `.section-gap` = margin-bottom: 48px
- `.card-gap` = margin-bottom: 24px

## Spacing (8pt grid)
- Section spacing: 48px (space-y-12)
- Card spacing: 24px (gap-6)
- Text spacing: 16px
- Card padding: 32px (card-pad)

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema Extensions
- entries: `pinned` (bool), `image_url` (text)
- storage bucket: `capture-images` (public)

## Design
- RTL support via dir="auto" on all text
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived
