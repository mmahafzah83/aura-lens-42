## Goal

Stop silent capture loss caused by fire-and-forget `.invoke()` in the ingest-capture → extract-evidence → detect-signals-v2 chain. Mirror the proven `EdgeRuntime.waitUntil` pattern from `ingest-document/index.ts` (L376–391) at both sites so the isolate is kept alive until the background work finishes, while the HTTP response still returns promptly.

## Snapshots first

- `supabase/functions/ingest-capture/index.ts` → `supabase/functions/ingest-capture/index.pre-capture-chain-waituntil.bak.ts`
- `supabase/functions/extract-evidence/index.ts` → `supabase/functions/extract-evidence/index.pre-capture-chain-waituntil.bak.ts`

## Site 1 — ingest-capture/index.ts (L278–288)

Before:
```ts
supabase.functions.invoke("extract-evidence", {
  body: {
    source_type: "entry",
    source_id: newEntryId,
    user_id: effectiveUserId,
  },
}).catch((e: any) =>
  console.warn("[ingest-capture] extract-evidence invoke failed:", e?.message)
);
console.log("[ingest-capture] extract-evidence invoked for entry:", newEntryId);
```

After:
```ts
// @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
EdgeRuntime.waitUntil((async () => {
  try {
    const { error: extractError } = await supabase.functions.invoke("extract-evidence", {
      body: {
        source_type: "entry",
        source_id: newEntryId,
        user_id: effectiveUserId,
      },
    });
    if (extractError) {
      console.warn("[ingest-capture] extract-evidence invoke failed:", extractError);
    }
  } catch (e: any) {
    console.warn("[ingest-capture] extract-evidence invoke threw:", e?.message);
  }
})());
console.log("[ingest-capture] extract-evidence invoked for entry:", newEntryId);
```

Payload unchanged. Response continues to return at the existing `return new Response(...)` below — `waitUntil` does not block it.

## Site 2 — extract-evidence/index.ts (L320–331)

Before:
```ts
if (inserted.length > 0) {
  const fragmentIds = inserted.map((f: any) => f.id);
  adminClient.functions.invoke("detect-signals-v2", {
    body: {
      fragment_ids: fragmentIds,
      source_registry_id: registryId,
      user_id: registry.user_id,
    },
  }).catch((e: any) =>
    console.warn("[extract-evidence] detect-signals-v2 chain failed:", e?.message)
  );
  console.log("[extract-evidence] chained detect-signals-v2 with", fragmentIds.length, "fragments");
}
```

After:
```ts
if (inserted.length > 0) {
  const fragmentIds = inserted.map((f: any) => f.id);
  // @ts-ignore EdgeRuntime.waitUntil is available in Supabase Edge Functions
  EdgeRuntime.waitUntil((async () => {
    try {
      const { error: sigError } = await adminClient.functions.invoke("detect-signals-v2", {
        body: {
          fragment_ids: fragmentIds,
          source_registry_id: registryId,
          user_id: registry.user_id,
        },
      });
      if (sigError) {
        console.warn("[extract-evidence] detect-signals-v2 chain failed:", sigError);
      }
    } catch (e: any) {
      console.warn("[extract-evidence] detect-signals-v2 chain threw:", e?.message);
    }
  })());
  console.log("[extract-evidence] chained detect-signals-v2 with", fragmentIds.length, "fragments");
}
```

Payload unchanged. Response at L334 continues to return immediately.

## Notes

- Each link wraps its own `waitUntil` so the chain is kept alive end to end (ingest-capture keeps the extract step alive; extract-evidence independently keeps the signal-detect step alive).
- Nothing else changes: no payload edits, no response-shape changes, no awaits added to the response path, no new error handling beyond logging.
- Preview only — do not publish.

## Self-check (after edit)

```
rg -n "EdgeRuntime.waitUntil|extract-evidence|detect-signals-v2" supabase/functions/ingest-capture/index.ts supabase/functions/extract-evidence/index.ts
```

Confirm: (a) both invokes wrapped in `EdgeRuntime.waitUntil`, (b) the `return new Response(...)` in each file is not awaiting the background chain, (c) payload bodies byte-identical to before. Report the before/after blocks for both sites.
