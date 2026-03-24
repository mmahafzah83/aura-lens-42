Intelligence layer: source_registry + evidence_fragments tables for structured evidence extraction from all captures.

## Tables
- source_registry: unified index of all knowledge inputs (entries, documents, frameworks, intelligence)
  - Unique on (user_id, source_type, source_id)
  - Tracks processed status and fragment_count
- evidence_fragments: structured extractions (claims, signals, framework_steps, market_facts, skill_evidence, insights, patterns, recommendations)
  - Links to source_registry via source_registry_id (CASCADE delete)
  - Has embedding, tsv, entities (jsonb), confidence score

## Edge Functions
- extract-evidence: processes a single source into fragments using AI
- backfill-intelligence: registers all historical data and processes in batches of 5

## Integration Points
- CaptureModal: auto-triggers extract-evidence after entry insert
- DocumentUpload: auto-triggers extract-evidence after document ingestion
