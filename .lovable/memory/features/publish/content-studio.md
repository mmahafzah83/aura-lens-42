# Memory: features/publish/content-studio
Updated: now

The 'Publish > Create' tab (Content Studio) is the unified destination for all strategic drafting workflows. It consumes pre-filled briefs (Topic, Context, and source metadata) from Signals, Recommended Moves, Insights, Frameworks, and 'Where to build authority next' recommendations.

## Entry Points
- **Signals** → Draft Content → Content Studio (post, hook→insight→question)
- **Insights** → Draft Content → Content Studio (post, hook→insight→question)
- **Insights** → Build Framework → Content Studio (framework_summary, auto framework)
- **Recommended Move** → Draft Content → Content Studio (post)
- **Recommended Move** → Build Framework → Content Studio (framework_summary, auto framework)
- **Signal Priority** → Develop Framework → Content Studio (framework_summary, auto framework)
- **Strategic Insight** → Build Framework → Content Studio (framework_summary, auto framework)
- **Authority Next** → Create Post → Content Studio (post)

## sourceType routing
When `sourceType === "framework_build"`, CreateTab auto-selects `framework_summary` content type and `auto` framework instead of the default `post` + `hook_insight_question`.

## Visual Companion
The studio integrates a 'Visual Companion' section for generating Blackboard Schematic visuals via the 'regenerate-schematic' Edge Function, which becomes accessible immediately upon topic entry.

## Content Format Labels
- LinkedIn Post
- Carousel
- Strategic Essay
- **Framework Builder** (renamed from "Framework Breakdown")

## Legacy
This unified flow replaces the legacy 'LinkedInDraftPanel' side drawer for these primary strategic entry points. The old FrameworkBuilder modal is still used for "Open Framework" actions in the Frameworks sub-tab.
