

## Plan: Hybrid Smart Signal Grouping (4 Groups)

### Concept
Replace the current naive "first theme_tag" grouping with 4 intelligent categories derived from the user's profile foundations. Each signal gets classified into exactly one group using keyword matching against profile data.

### The 4 Groups

| Group | Source Data | Fallback Label |
|-------|-----------|----------------|
| **My Industry** | `sector_focus` keywords | "Industry Signals" |
| **My Edge** | `core_practice` + `brand_pillars` keywords | "Expertise Signals" |
| **My Trajectory** | `north_star_goal` + career/opportunity tags | "Growth Signals" |
| **Horizon Watch** | Everything that doesn't match above | "Emerging Signals" |

Group names adapt dynamically. E.g. if `sector_focus = "Water Utilities"`, the header reads **"Water Utilities"** instead of a generic label.

### Changes

**File: `src/components/tabs/IntelligenceTab.tsx`**

1. **Fetch profile data** — add `diagnostic_profiles` query (sector_focus, core_practice, north_star_goal, brand_pillars) alongside the existing signals fetch in `loadSignals`.

2. **Build keyword matchers** — normalize profile fields into keyword sets for each of the 3 anchored groups (industry, edge, trajectory).

3. **Replace `groupedSignals` logic** — instead of grouping by `theme_tags[0]`, classify each signal by scanning its `theme_tags`, `signal_title`, and `explanation` against the 3 keyword sets. First match wins (priority: Industry > Edge > Trajectory). No match = Horizon Watch.

4. **Update group headers** — use personalized labels from profile data (e.g. the sector name) with fallbacks. Display order is fixed: My Industry, My Edge, My Trajectory, Horizon Watch.

5. **Filter chips stay unchanged** — the horizontal tag filter still works on raw theme_tags. Only the "Group by theme" toggle uses the new smart grouping.

### What stays the same
- Signal cards, sorting, search, archive, expand/collapse
- Filter chips (raw theme_tags)
- No database changes, no new Edge Functions
- No changes to other tabs or components

