---
name: Shared text layer (textMatch)
description: One normaliser/stemmer/alias module for every text comparison; theme_aliases table rules
type: feature
---

- `supabase/functions/_shared/textMatch.ts` is the ONLY place text is normalised, stemmed or aliased. The browser imports it directly (same pattern as `_shared/voiceCorpus`). No local copies — `themeMatch.ts` and `linkedin-fetch-profile`'s applied_at check both consume it.
- Stemming is deliberately conservative: `ies→y`, `es→` after s/x/z/ch/sh, `s→` (never after ss/us/is), `'s→`. Never under 4 characters, never non-Latin. No -ing/-ed/-ment. Over-stemming causes false positives, which are worse than silence.
- Matching is set membership on stemmed tokens, so "ai" can never match inside "airport" — there is no substring test anywhere.
- Arabic: tatweel and harakat stripped, أ إ آ ا→ا, ى→ي, ة→ه, applied inside `normaliseText` when Arabic script is present.
- Aliases live in `public.theme_aliases` (canonical, alias, locale, source, active). Readable by any signed-in user, admin-only writes. Loaded once per session and cached in `src/lib/themeAliases.ts`; a failed read degrades to exact matching and must never break the card.
- Expansion is BOTH directions, ONE hop, tested against the original token set so it cannot chain.
- NEVER seed an alias that is a stopword — `information technology ↔ it` in particular. A DB trigger (`reject_stopword_alias`) and `isSafeAlias` both reject them.
- The two-tier state rule (STATED = headline + About, LISTED = roles + skills) is unchanged and verified; only the token comparison underneath it moved.
