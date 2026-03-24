Framework diagram generation system with AI-determined diagram types and Gemini image generation.

## DB Changes
- master_frameworks: added `diagram_url` (text) and `diagram_description` (jsonb)

## Edge Functions
- extract-framework: now also extracts diagram_description (type, nodes, connections, layout_notes) and triggers diagram generation
- generate-framework-diagram: generates blackboard schematic diagram image from diagram_description using Gemini, uploads to capture-images bucket

## Diagram Types
sequential_flow, layered_architecture, circular_model, pyramid, matrix, hub_spoke

## UI (MyFrameworks.tsx)
- Shows diagram image on expanded framework card
- Generate Diagram button if no diagram exists
- Regenerate Diagram button to get new visual
- Refine dialog: edit title, summary, and steps inline
- Approve Framework: adds "Approved" tag
