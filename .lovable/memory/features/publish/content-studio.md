# Memory: features/publish/content-studio
Updated: now

Content Studio (Publish > Create) is the **canonical home for all content creation workflows**, including LinkedIn Post, Carousel, and Framework Builder (Strategic Essay was removed).

## Carousel Entry Point Unification
All carousel creation now routes through Content Studio. Components that previously mounted their own `CarouselGenerator` modal (StrategicSignals, AuthorityOpportunities, DailyStrategicBriefing, StrategicIntelligenceEngine) now call `onDraftToStudio` with `contentFormat: "carousel"` instead, which navigates the user to Publish > Create with carousel format pre-selected and topic/context pre-filled. The `signalPrefill` type includes an optional `contentFormat` field (`"post" | "carousel" | "framework_summary"`).

## sourceType routing
When `sourceType === "framework_build"` or `contentFormat === "framework_summary"`, CreateTab auto-selects `framework_summary` content type and `auto` framework.
When `contentFormat === "carousel"`, CreateTab auto-selects carousel and opens the CarouselGenerator workflow.

## Visual Companion
The studio integrates a 'Visual Companion' section for generating Blackboard Schematic visuals via the 'regenerate-schematic' Edge Function, accessible upon topic entry.

## Content Format Labels
- LinkedIn Post
- Carousel
- Framework Builder

## Legacy
StrategicSignals and AuthorityOpportunities are orphaned components (not mounted in the active app tree). BriefingTab is also orphaned.
