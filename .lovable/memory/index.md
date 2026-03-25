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
