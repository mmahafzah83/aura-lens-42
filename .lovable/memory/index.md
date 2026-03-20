Aura app: EY Director executive coaching tool with bilingual AR/EN support, dark theme, gold accents.

## Language
- LanguageProvider in src/contexts/LanguageContext.tsx
- IBM Plex Sans Arabic font for Arabic, Inter for English, Playfair Display for EN headings
- RTL support via html dir attribute toggle
- Language preference stored in localStorage as "aura-lang"

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema Extensions
- entries: added `pinned` (bool, default false), `image_url` (text, nullable), `tsv` (tsvector, generated), `embedding` (vector(1536))
- documents: id, user_id, filename, file_url, file_type, status, summary, page_count
- document_chunks: id, document_id, user_id, content, chunk_index, metadata, tsv (tsvector), embedding (vector(1536))
- search_vault() RPC: HYBRID search combining keyword (tsvector 40%) + semantic (pgvector cosine 60%)
- pgvector extension enabled in public schema
- storage buckets: `capture-images` (public), `documents` (private)

## Edge Functions
- summarize-link, draft-post, transcribe-voice, analyze-potential, analyze-image, chat-aura, ingest-document, generate-embedding
- chat-aura: Hybrid RAG (keyword+semantic) with modes: default, draft-deck, meeting-prep, synthesize-pursuit. Uses openai/gpt-5-mini.
- ingest-document: Gemini multimodal extraction → chunking → tsvector + embedding storage
- generate-embedding: OpenAI text-embedding-3-small → stores vector in entries or document_chunks

## Design
- RTL support via dir="auto" on all text + global RTL toggle
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived
- Use logical CSS props (start/end/ps/pe/ms/me) for RTL compatibility
