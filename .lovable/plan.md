# Home tab — full layout redesign

## Diagnostic: existing section locations in `src/components/tabs/HomeTab.tsx`

| Section | Lines | Notes |
|---|---|---|
| Greeting + score + capture-rhythm header | 1623–1741 | Current 2-column block: greeting/score/tier left, 12-week rhythm cells right |
| `<BeatDivider label="What to do next" />` | 1746 | The "WHAT TO DO NEXT" divider — REMOVE |
| `<AuthorityPulseStrip>` (Signals/Posts/Engagement/Followers) | 1748–1752 | The 4-stat summary card — REMOVE |
| `<JourneyCycle>` | 1753–1762 | Keep (conditional, only when no signals) |
| `<MissionControl>` | 1763 | Keep, restyle as new MISSIONS section |
| Forces strip / score breakdown (Signal/Content/Consistency, weakest nudge, "See full breakdown →") | 1768–1860 | Restyle as new THREE FORCES section |
| `<WeeklyIntelligenceLoopCard>` | 1862 | Keep in place |
| `<SilenceAlarm>` | 1865–1871 | Keep in place |
| Welcome card (showWelcome) | 1873–1982 | Keep in place |
| New-signal banner (newSignal) | 1986–2083 | Keep (event-triggered, "stays where it naturally appears") |
| Dynamic primary card (alarmFresh / caughtUpReady / personalized_nudge / topMove) | 2084–2319 | The "BRIEFING" — restyle the `personalized_nudge` branch as the new BRIEFING block |
| Secondary moves toggle | 2322–2358 | Keep in place |
| `<YourMoves>` (Aura's Read PUBLISH/CAPTURE/WATCH) | 2360–2367 | Keep data source; split into new URGENT + YOUR MOVES sections |
| `<MarketScan>` | 2369–2370 | Keep, restyle as new collapsible MARKET SCAN |

**Not found:**
- "WHAT'S HAPPENING" divider — only one `<BeatDivider>` exists ("What to do next" at line 1746). No other divider component with that label in HomeTab.tsx. Will treat as already absent.
- "Aura's read — Tue, May 26 / What Aura thinks you should focus on today" header — no such literal header exists. `<YourMoves>` renders its own internal "Your moves / Based on your signals and data" header (`src/components/home/YourMoves.tsx` lines 153–160). Will remove that internal header as part of the restyle so the items merge into URGENT + YOUR MOVES.

## Implementation plan (frontend only, no EF changes)

Snapshot `pre-home-layout-redesign` first.

### 1. HEADER — Greeting + Arc gauge (replace 1623–1741)
- Left column: date (`TUESDAY, MAY 26, 2026` from `now`, 11px tertiary, .05em), serif greeting (`getGreetingTitle(...)`, 22px Cormorant 500), subtext `{sector} · {tier} tier`.
- Right column: SVG semi-circular arc gauge, dashoffset = `132 - (score/100)*132`, score number 28px Cormorant 500 below, "of 100" 9px tertiary.
- Drop the 12-week rhythm cells, the dipDelta/days-since line, the tier line, and the existing score row.

### 2. THREE FORCES (replace 1768–1860, move to directly under header)
- Three flex columns separated by 0.5px vertical dividers.
- Each column: large 26px serif weighted score in semantic color (Signal=warning/gold, Content=info/blue, Consistency=success/green), `/40` or `/20` tertiary, label ("Signal strength" / "Content published" / "Weekly rhythm"), 2px progress bar.
- Below 0.5px border: bolt icon + weakest-pillar nudge ("[Pillar] is your biggest growth lever right now", pillar name in its semantic color, computed by lowest pct) on the left; "See full breakdown →" link (currently navigates to `influence` tab via existing `onSwitchTab?.("influence")`) on the right.

### 3. SIGNAL BANNER — leave between forces and briefing (1986–2083 unchanged in place).

### 4. BRIEFING (restyle current personalized_nudge branch, lines 2266–2294)
- Drop card bg/border; use `border-left: 3px solid var(--color-text-warning); padding-left: 16px`.
- Label "BRIEFING" 11px warning. Headline (briefing title) 15px Cormorant 500. Body 13px secondary, append signal-reinforcement guidance when the weakest pillar is signal/capture. CTA button styled per spec.
- Keep the alarmFresh + caughtUpReady + topMove fallback branches intact as-is (they already serve distinct event states).

### 5. MISSIONS (restyle `<MissionControl>`)
- Edit `src/components/home/MissionControl.tsx`:
  - Header: "THIS WEEK'S MISSIONS" 11px tertiary on the left; "X of Y · +N pts available" with the points portion in success green, computed by summing points of incomplete missions.
  - Intro line "Complete these to grow your presence score. Each one strengthens a different pillar.".
  - Each row: keep the existing checkbox/toggle logic; add a 1-line explanation under the title (lookup keyed by `title` for the 3 default missions; for "Publish from your strongest signal", interpolate signal name + fragment count if supplied via new optional props `topSignalTitle` / `topSignalFragments` passed from HomeTab).
  - Right side: keep points badge in success green; add pillar label below in semantic color (Signal=warning, Content=info, Voice=success — derive from `mission_type`).

### 6. URGENT (conditional, new block, sourced from existing YourMoves data)
- Lift the data fetch out of `<YourMoves>` so HomeTab owns the `auras-read` items and can split them. Simplest path: refactor `src/components/home/YourMoves.tsx` to accept an optional `items` prop; if absent, fall back to current self-fetch. In HomeTab, fetch once via `supabase.functions.invoke("auras-read", ...)`, pick the first HIGH-urgency PUBLISH item for URGENT, pass the remainder to `<YourMoves items={rest} />`.
- URGENT card: top 0.5px border, "URGENT" label in danger, 15px Cormorant title, body 12px secondary with inline-colored data (fragments=primary, days=danger, points=success — interpolated from `topSignal`, `daysSinceLastPost` derivable from existing `lastCaptureAt` data, mission points constants), two buttons ("Draft this post →" danger filled + "View signal →" outline) wired to `onSwitchTab?.("authority")` and `onSwitchTab?.("intelligence")`.

### 7. YOUR MOVES (restyle `<YourMoves>` body, drop its internal header)
- In `YourMoves.tsx`: replace the existing header block (153–160) with the new "YOUR MOVES" 11px tertiary + "Based on your signals" right-aligned, intro line "Actions Aura recommends based on your intelligence data. Each moves your score forward.", and re-skin each row to a compact flex row: colored action badge (CAPTURE warning, WATCH info, PUBLISH danger using `*-pale` bg + main fg), 12px primary title, chevron-right tertiary, `hsl(var(--muted))` background, md radius, 10×12 padding.
- Add 0.5px top border + 20px padding-top on the wrapper.

### 8. MARKET SCAN (restyle `<MarketScan>` header)
- In `src/components/home/MarketScan.tsx`: add 0.5px top border + 20px padding-top, header row "MARKET SCAN" 11px tertiary + chevron-down toggle (default expanded), intro line "AI-curated articles aligned to your sector. Verify before citing.". Keep the existing card rendering (S-A-V cards from the earlier intelligence redesign already shipped) untouched below.

### 9. Cleanup
- Delete the `<BeatDivider label="What to do next" />` call and the `<AuthorityPulseStrip>` import + render. Keep `JourneyCycle` in its current conditional position (it's a no-signals empty-state aid) — rendered above MISSIONS without the wrapper divider.
- The `BeatDivider` component definition (line 2403) can remain unused for now; no other callers exist.

## Files touched

- `src/components/tabs/HomeTab.tsx` — reorders, removes 4-stat strip + "What to do next" divider, rewrites header + forces blocks, restyles briefing branch, adds URGENT block, owns auras-read split.
- `src/components/home/MissionControl.tsx` — header restyle, intro text, per-row explanation + pillar label, accept optional `topSignalTitle` / `topSignalFragments` props.
- `src/components/home/YourMoves.tsx` — accept optional `items` prop, swap header + row styling.
- `src/components/home/MarketScan.tsx` — add section header + collapsible chevron + intro line.

## Technical notes

- No EF or schema changes. URGENT/YOUR MOVES split reuses `auras-read`; weakest-pillar logic reuses `auraData.signal_score|content_score|capture_score`; mission explanation reuses `topSignal` already in HomeTab scope.
- All colors via existing CSS vars (`--color-text-warning`, `--color-text-info`, `--color-text-success`, `--color-border-tertiary`, `--color-text-primary/secondary/tertiary`, danger pale/main). Arc gauge strokes use vars so light/dark themes both work.
- Animations and the existing `<AnimatedScore>` count-up are preserved for the new header score.
