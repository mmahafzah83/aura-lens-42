---
name: Intelligence page structure
description: Command Center master/detail layout with counter bar, automation strip, next move, 3 tabs, and key insights strip
type: feature
---

The Intelligence page uses a Command Center layout with these sections:

1. **Counter bar** — 4 metrics: Sources | Patterns found (gold) | Moves | Published
2. **Automation strip** — 3 status cards (Auto-detect, Weekly refresh, Move generation), collapsible with localStorage key 'aura_automation_collapsed'
3. **Next move card** — from StrategicAdvisorPanel, gold left border
4. **Tab bar** — Intelligence | Frameworks | Sources

**Intelligence tab**: Master/detail command center
- Left (58%): Full signal detail panel — confidence %, title, what this means, key insight, sources, confidence formula, "Write on this"
- Right (42%): Ranked signal list, click-to-select, active row has gold left border + white title + gold %
- "Show all patterns" expands remaining signals beyond first 8
- Key Insights strip below: 3-column grid of learned_intelligence with type badges, "Write on this →"
- No group-by-theme toggle, no filter chips, no mini cards, no "Build framework" button, no old stacked cards

**Frameworks tab**: 2-column grid with filter chips (All/Approved/Draft), View/Refine/Draft/Delete actions, gold top border on approved, delete confirmation dialog

**Sources tab**: Delegated to SourcesSubTab component (unchanged)

Removed: Insights sub-tab, editorial 2-column layout, mini cards, ranked list with micro bars, group-by-theme toggle, filter chips on signals, "Build framework" button on Intelligence tab
