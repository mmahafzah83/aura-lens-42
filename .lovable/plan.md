## Goal

HomeTab's hero (score arc + 7d diff), top-signal + count, evidence count, and top-move + count don't auto-refresh after a capture. Extend the existing realtime block (currently only `industry_trends`, L884–897) to subscribe to the four user tables and re-invoke the existing loaders.

## Mapping: table → existing loader → Home value

Verified against `src/components/tabs/HomeTab.tsx`:

- `score_snapshots` → `loadBriefing(uid)` (L433, sets `latestScore` L451 + `score7dAgo` L452 → score arc + 7d diff)
- `strategic_signals` → `loadBriefing(uid)` + `loadCompetitorAlert(uid)` (sets `topSignal` L462, total signal count L463–467, and `fragment_count` for the evidence number L626/L687)
- `evidence_fragments` → `loadBriefing(uid)` + `loadCompetitorAlert(uid)` (HomeTab reads fragment counts off `strategic_signals`; re-running these reloads the derived evidence count)
- `recommended_moves` → `loadBriefing(uid)` (sets `topMove` L468) + `loadMoves(uid)` (sets `moves` list L498)

Reusing existing loaders only — no rewrites.

## Snapshot first

Copy `src/components/tabs/HomeTab.tsx` → `src/components/tabs/HomeTab.pre-hometab-realtime.bak.tsx` before editing.

## Edit (single, surgical)

In the existing `useEffect` at L883–899, add one extra channel alongside the current `industry_trends_${uid}` channel. Do not modify the trends channel.

```ts
// Coalesce bursts: a single capture writes to several of these tables.
let homeReloadTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleHomeReload = () => {
  if (homeReloadTimer) clearTimeout(homeReloadTimer);
  homeReloadTimer = setTimeout(() => {
    loadBriefing(uid);
    loadMoves(uid);
    loadCompetitorAlert(uid);
  }, 750);
};

const homeLive = supabase
  .channel(`home-live-${uid}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'score_snapshots', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'score_snapshots', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'strategic_signals', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'strategic_signals', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'evidence_fragments', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'evidence_fragments', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'recommended_moves', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'recommended_moves', filter: `user_id=eq.${uid}` },
    scheduleHomeReload)
  .subscribe();
```

Extend the existing cleanup to remove the new channel and clear the timer:

```ts
return () => {
  if (homeReloadTimer) clearTimeout(homeReloadTimer);
  supabase.removeChannel(channel);
  supabase.removeChannel(homeLive);
};
```

**Deps array: leave unchanged (uid-gated).** Do NOT add `loadCompetitorAlert` or any other loaders to the existing deps. The closure captures them; the effect should only re-subscribe when uid changes.

## Notes

- INSERT + UPDATE only (skipping DELETE — RLS-on-delete edge case).
- One channel, unique name `home-live-${uid}` → no duplicates on re-render.
- ~750ms debounce coalesces the capture burst into a single triplet of loader calls.
- All 4 tables already in `supabase_realtime` publication (prior migration).
- Preview only — no publish. Latency diagnostic to follow.

## Self-check (after edit)

Run `rg -n "home-live-|scheduleHomeReload|removeChannel" src/components/tabs/HomeTab.tsx` and report the subscription block plus cleanup, confirming: (a) all 4 tables subscribed and user-filtered, (b) INSERT + UPDATE only, (c) debounced via `scheduleHomeReload`, (d) `removeChannel(homeLive)` + `clearTimeout` in cleanup, (e) deps array unchanged.
