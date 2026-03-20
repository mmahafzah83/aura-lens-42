Aura app: EY Director executive coaching tool, English-only, dark theme, gold accents.

## Skill Pillars
C-Suite Advisory, Strategic Architecture, Industry Foresight, Transformation Stewardship, Digital Fluency

## DB Schema
- entries: pinned, image_url, tsv, embedding(1536), account_name, framework_tag
- documents, document_chunks: with tsv + embedding
- focus_accounts: id, user_id, name (CRUD via modal)
- master_frameworks: id, user_id, entry_id, title, framework_steps(jsonb), summary, tags(text[]), source_type
- skill_targets, training_logs
- search_vault() RPC: hybrid keyword+semantic search
- storage: capture-images (public), documents (private)
- Realtime enabled on entries table

## Edge Functions
- summarize-link, draft-post, transcribe-voice, analyze-potential, analyze-image
- chat-aura: RAG with modes (default, draft-deck, meeting-prep, synthesize-pursuit)
- ingest-document, generate-embedding, account-brief
- extract-framework: AI extracts steps from #ExpertFramework captures → master_frameworks
- draft-post & analyze-potential: consult master_frameworks to apply expert rules

## Expert System Pipeline
- CaptureModal auto-detects expert framework content via regex → sets framework_tag="#ExpertFramework"
- extract-framework edge function: extracts structured steps → saves to master_frameworks
- draft-post: fetches user's frameworks and injects into system prompt for LinkedIn drafts
- analyze-potential (The Mirror): fetches frameworks to evaluate brand against expert rules

## Design
- Glass card aesthetic with gold gradients
- Entries >30 days without pin → archived
- Arabic removed; English-only; no RTL
