Canonical action system standardized across all Aura surfaces.

## Action Constants (src/components/ui/action-buttons.tsx)
- Signal: Explore → Create Insight → Develop Framework → Draft Content
- Insight: Expand → Build Framework → Draft Content
- Framework: Open Framework → Refine Framework → Draft Content
- Content: Draft Content → Save for Later
- Conversational: "Ask Aura" / "Discuss with Aura" / "Critique with Aura"

## Components Updated
- StrategicCommandCenter (Home hero)
- StrategicAdvisorPanel (Home + Strategy)
- StrategicCompanion (Home critique)
- StrategyTab (signals, insights, frameworks)
- IntelligenceTab (signal cards)
- AuthorityOpportunities ("Draft Post" → "Draft Content")
- IntelligenceCards ("Draft Post" → "Draft Content")

## Rules
- Buttons must NOT default to Ask Aura unless explicitly conversational
- Same order everywhere for same object type
- Every action provides feedback (toast, loading, drawer)
