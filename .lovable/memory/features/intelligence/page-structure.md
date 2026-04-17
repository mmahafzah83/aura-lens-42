---
name: Intelligence page structure
description: Command Center master/detail layout with 3-cell counter bar, automation strip, next move, and 2 tabs (Signals, Sources)
type: feature
---

The Intelligence page uses a Command Center layout with these sections:

1. **Counter bar** — 3 metrics: Sources | Signals (gold) | Moves
2. **Automation strip** — 3 status cards (Auto-detect, Weekly refresh, Move generation), collapsible with localStorage key 'aura_automation_collapsed'
3. **Next move card** — from StrategicAdvisorPanel, single gold "Publish →" button
4. **Tab bar** — Signals | Sources (Frameworks tab removed; frameworks live in Publish → Library)

**Signals tab**: Master/detail command center
- Left (58%): Full signal detail panel — confidence %, title, what this means, key insight, sources, confidence formula, "Write on this"
- Right (42%): Ranked signal list, click-to-select, active row has gold left border + white title + gold %
- "Show all signals" expands remaining signals beyond first 8
- Signal rows show "X findings · Y orgs · ThemeGroup"

**Sources tab**: Delegated to SourcesSubTab component

Removed: Frameworks tab, Published counter, Key Insights strip below Command Center
