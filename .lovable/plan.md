

## Plan: Rename and improve smart group labels

### Problem
1. Group headers show raw profile values (e.g. "Water Utilities") without context — unclear what they represent
2. When keywords don't match, everything falls into "Horizon Watch" which is vague
3. Labels should feel personal and career-oriented ("My Industry", "My Expertise", etc.)

### Changes — `src/components/tabs/IntelligenceTab.tsx`

**1. Update `groupLabels` (line 765-770)**

Replace with clear, prefixed labels:

```ts
const groupLabels = useMemo(() => ({
  industry: profileAnchors.sectorFocus ? `My industry · ${profileAnchors.sectorFocus}` : "My industry",
  edge: profileAnchors.corePractice ? `My expertise · ${profileAnchors.corePractice}` : "My expertise",
  trajectory: profileAnchors.northStarGoal ? `My ambition · ${profileAnchors.northStarGoal}` : "My ambition",
  horizon: "Wider landscape",
}), [profileAnchors]);
```

This gives every group a clear, personal prefix while still showing the profile detail as context after the dot separator.

**2. Broaden keyword matching to reduce "Wider landscape" overflow (lines 748-761)**

Currently classification only checks exact substring matches. Improve by:
- Splitting multi-word profile values into individual keywords (e.g. "Digital Transformation" → ["digital", "transformation"])
- Adding common synonyms/related terms for industry and expertise matches
- Lowering the match threshold so signals with partial overlap still land in the right group

No database changes. No new files. Only `IntelligenceTab.tsx` is modified.

