Framework diagram generation system with AI-determined archetypes and diverse visual styles.

## DB Changes
- master_frameworks: has `diagram_url` (text) and `diagram_description` (jsonb)

## Edge Functions
- generate-framework-diagram: 3-step process — (1) AI selects archetype+style, (2) generates diagram description, (3) generates image. Supports `exclude_archetype`/`exclude_style` for regeneration variety.
- regenerate-schematic: content visual mode with 6 style families, supports `style_index` param.

## Diagram Archetypes (11)
pyramid_maturity, circular_flywheel, process_flow, system_architecture, org_structure, comparison_before_after, layered_operating_model, strategic_framework_map, decision_tree, mind_map, consulting_matrix

## Visual Style Families (9)
premium_consulting, strategic_blueprint, minimal_executive, editorial_authority, structured_infographic, whiteboard_sketch, system_schematic, flowchart_modern, strategic_card

## Content-to-Archetype Matching
- Levels/maturity → pyramid_maturity, layered_operating_model
- Cycles/loops → circular_flywheel
- Steps/workflows → process_flow, flowchart_modern
- Org/roles → org_structure
- Systems/capabilities → system_architecture
- Before/after → comparison_before_after
- Strategic dimensions → strategic_framework_map, consulting_matrix
- Branching decisions → decision_tree
- Interconnected themes → mind_map

## Regenerate Behavior
On regenerate, the previous archetype is excluded so a different visual type is always produced.

## Branding
- Dark premium backgrounds, gold (#d4a843) accents, white text
- Footer: "M. Mahafzah | Business & Digital Transformation Architect | Energy & Utilities"

## UI
- FrameworkBuilder: shows archetype+style label below diagram preview
- MyFrameworks: passes exclude_archetype on regenerate, shows style in toast
