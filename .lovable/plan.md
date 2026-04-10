

## Plan: Remove Graph Sub-Tab from Intelligence Page

### File: `src/components/tabs/IntelligenceTab.tsx`

1. **Remove "graph" from `SubTab` type** (line 146) — change to `"signals" | "insights" | "frameworks" | "sources"`

2. **Remove graph entry from `SUB_TABS` array** (line 852) — delete `{ value: "graph", label: "Graph" }`

3. **Remove graph-specific click handling** in the tab button `onClick` (lines 926-928) — remove the `if (tab.value === "graph")` branch

4. **Remove `graphOpen` state** (line 591) and the `<SignalGraph>` component render (lines 1038-1039)

5. **Remove `SignalGraph` import** (line 14)

Everything else (Signals, Insights, Frameworks, Sources tabs, pipeline bar, Recommended Move card, sidebar) stays untouched.

