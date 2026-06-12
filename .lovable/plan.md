# Carousel drafts in the Library

One pipeline. No schema change. Two source files edited + one shared constant addition.

## Diagnosis (confirmed)

- `CarouselStudio.saveToLibrary` (~1940–1976) inserts into `linkedin_posts` with `tracking_status='draft'`, `content_type='carousel'`, `source_type='carousel_studio'`, slide JSON in `source_metadata.slides`.
- `LibraryTab.loadPosts` (`AuthorityTab.tsx` ~2966–3028) reads drafts only from `content_items` where `status='draft'`. It reads `linkedin_posts` only for the Published section, gated by `p.published_at || isPublishedPost(p)`.
- Net effect: a carousel draft has no `published_at`, and `('carousel_studio','draft')` is not in the published pair-set → it appears nowhere.

## Scope

- `src/components/tabs/AuthorityTab.tsx` (LibraryTab merge, draft card, publish branch)
- `src/pages/CarouselStudio.tsx` (route prefill for resuming an existing draft, in-place save)
- `src/lib/postProvenance.ts` + `supabase/functions/_shared/postProvenance.ts` (add one pair — see Change 2)

No SQL, no other readers, no edge functions, no voice-learning hooks for carousels.

## Change 1 — Drafts section reads carousel drafts too

In `LibraryTab.loadPosts`:

1. Add `content_type` to the `linkedin_posts` select list.
2. After `Promise.all`, derive a second slice:

   ```ts
   const liCarouselDrafts: SavedPost[] = (liRes.data || [])
     .filter((p: any) =>
       p.tracking_status === "draft" && p.content_type === "carousel"
     )
     .map((p: any) => ({
       ...p,
       format_type: "carousel",
       _source: "linkedin_posts" as const,
     }));
   ```
3. Merge and sort by `created_at` descending:

   ```ts
   const allDrafts = [...ciDrafts, ...liCarouselDrafts].sort(
     (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
   );
   setDrafts(allDrafts);
   ```
4. Published filter unchanged — `p.published_at || isPublishedPost(p)` is false for carousel drafts today (no `published_at`, pair not in set), so the Published list does not change.
5. Realtime channel on `linkedin_posts` for the current user already triggers `loadPosts()`, so carousel saves and publishes reflect instantly with no manual refetch.

### Card rendering

The existing draft card already differentiates `format_type === "carousel"` for the type badge (~2340). Two small adjustments inside the draft-card render block (~3211+):

- **Date + time on every draft card:** replace `formatSmartDate(p.created_at)` (line 3306) with a combined date+time string:

  ```ts
  new Date(p.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  ```

  Applied to all drafts (post + carousel) for one consistent recency cue. Published cards unchanged.

- **Edit button for carousel drafts:** in the existing Edit handler (~3324), branch when `_source === "linkedin_posts"` and `format_type === "carousel"`. Instead of calling `onOpenDraft` (which routes to the Create tab), `navigate("/carousel-studio", { state: { ... } })` carrying the draft id, slides, style, lang, hashtags, signal id, author fields, etc., reconstructed from `source_metadata`.

### CarouselStudio: resume an existing draft

Extend the `navState` type at ~1568 to also accept:

```ts
draftId?: string;
draftCarousel?: {
  slides: Slide[];
  style: StyleKey;
  carousel_title?: string;
  hashtags?: string[];
  signal_id?: string;
  lang?: "en" | "ar";
  linkedin_caption?: string;
  author_name?: string;
  author_title?: string;
};
```

When `navState.draftId` is present on mount, hydrate `carousel`, `styleKey`, `lang`, `selectedSignalId` from `draftCarousel` and store `draftId` in component state. Modify `saveToLibrary` (~1940): when `draftId` is set, `update(...)` the existing `linkedin_posts` row in place instead of `insert(...)` (same payload, scoped to `.eq("id", draftId)`). Toast unchanged ("Carousel saved to Library").

This keeps Drafts to one row per carousel — successive saves update in place, realtime re-sorts, the card stays at the top.

## Change 2 — "Published to LinkedIn" action parity, preserving provenance

A carousel draft is **already** in `linkedin_posts` — flipping in place is the parity move and avoids duplicates. `source_type` is immutable provenance and stays `'carousel_studio'` forever.

**Provenance addition.** Add `['carousel_studio', 'published']` to `PUBLISHED_PAIRS` in both `src/lib/postProvenance.ts` and `supabase/functions/_shared/postProvenance.ts` (the mirror), so that `isPublishedPost` legitimately returns true for a published carousel row. The pair is also automatically added to `PUBLISHED_SOURCE_TYPES` / `PUBLISHED_TRACKING_STATUSES` by the existing `Array.from(new Set(...))` derivations — no further changes to query helpers.

**Handler.** In `LibraryTab.markPublished` (~3041), branch on `_source`:

- `_source === "content_items"` → unchanged (still uses `insertPublishedLinkedInPost`, still updates `content_items.status='published'`).
- `_source === "linkedin_posts"` (carousel draft) → in-place update only, no voice-learning, no new row:

  ```ts
  await supabase.from("linkedin_posts").update({
    tracking_status: "published",
    published_at: new Date().toISOString(),
    linkedin_url: trimmedUrl ?? null,
    published_confirmed_at: trimmedUrl ? new Date().toISOString() : null,
  }).eq("id", id);
  ```

  No `source_type` write. No `insertPublishedLinkedInPost` call. No voice-profile read or write of any kind — generated captions are never fed back into the authored-only voice profile.

  `isPublishedPost` now returns true for `('carousel_studio','published')`, so the row enters the Published list on the next `loadPosts()` (already called at the end of the existing handler). Same ceremony toast. Same `linkedin_url` capture flow. Same delete handler (already `_source`-aware at line 3137).

Local state move: `setDrafts(prev => prev.filter(p => p.id !== id))`; `loadPosts()` then repopulates Published.

## Out of scope

- Schema: no new columns. `content_type` already exists on `linkedin_posts`.
- Published list's filter logic — unchanged.
- Post drafts in `content_items` — unchanged behavior, same handlers.
- `insertPublishedLinkedInPost` — untouched (still used by the post draft path and the Create→Publish path, both of which are authored posts that legitimately train the voice profile).
- Voice-learning loop for carousels — explicitly NOT added; captions are AI-generated and must never train authored-only voice provenance.

## Technical notes

- Files: `src/components/tabs/AuthorityTab.tsx`, `src/pages/CarouselStudio.tsx`, `src/lib/postProvenance.ts`, `supabase/functions/_shared/postProvenance.ts`.
- `SavedPost` already permits both `_source` values; no type change required.
- Realtime channel on `linkedin_posts` covers both save-in-place and publish-in-place.

## Verification

1. Generate a carousel → Save to Library → switch to Library tab → carousel appears at the top of Drafts with timestamp formatted like `Jun 12, 3:42 PM`, badge "Carousel".
2. Click Edit on the carousel draft → opens `/carousel-studio` with the slides loaded; saving again updates the same row (no duplicate in Drafts, timestamp re-sorts to top).
3. Click "Published ✓" on the carousel draft (with or without URL) → card disappears from Drafts and appears in Published. SQL check on that row: `tracking_status='published'`, `published_at` set, `source_type` **still `'carousel_studio'`** (immutable), `linkedin_url` matches the entered value or null. `isPublishedPost` returns true via the newly added pair.
4. A post draft from `content_items` still publishes via `insertPublishedLinkedInPost` (separate row), `content_items.status='published'` — unchanged.
5. `authority_voice_profiles.example_posts` is unchanged before vs. after a carousel publish — confirms no voice-learning side effect.
6. Published list with no carousels involved — pixel-identical behavior.
7. `diff src/lib/postProvenance.ts supabase/functions/_shared/postProvenance.ts` shows only the existing mirror-comment differences plus the same new pair entry on both sides.
