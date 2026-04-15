---
name: Intelligence page structure
description: Editorial 2-column layout with counter bar, automation strip, next move, and 3 tabs (Intelligence/Frameworks/Sources)
type: feature
---

The Intelligence page uses an editorial layout with these sections:

1. **Counter bar** — 4 metrics: Sources | Patterns found (gold) | Moves | Published
2. **Automation strip** — 3 status cards (Auto-detect, Weekly refresh, Move generation), collapsible with localStorage persistence
3. **Next move card** — from StrategicAdvisorPanel, gold left border
4. **Tab bar** — Intelligence | Frameworks | Sources

**Intelligence tab**: 2-column editorial layout
- Left (55%): Feature card with #1 signal by confidence, large % number, gold top border
- Right (45%): 2 mini cards (#2, #3) + ranked list (#4–#8) with micro confidence bars
- "Show all patterns" expands remaining signals
- No group-by-theme, no filter chips, no "what this means for you" in card previews (only in expanded)

**Frameworks tab**: 2-column grid with filter chips (All/Approved/Draft), View/Refine/Draft/Delete actions, gold top border on approved

**Sources tab**: Delegated to SourcesSubTab component (unchanged)

Removed: Insights sub-tab (data still populates), group-by-theme toggle, filter chips on signals, stat cards row
