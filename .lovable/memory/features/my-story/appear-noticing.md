---
name: How You Appear — noticing when the member acts
description: Three-state subject matching, full-profile haystack, and applied-copy detection on the My Story mirror
type: feature
---

- Subject match is token-level and three-state: `carried` (all significant tokens found), `partial` (some), `missing` (none). Stopwords (of, the, and, for, in, to, a, an, on, with) are dropped; matches are whole-word bounded on both sides so "ai" never matches "airport". Logic lives in `src/lib/themeMatch.ts`.
- The haystack is the whole profile: headline, About, every role title (`position`/`title`/`jobTitle`/`role`) and description, and every skill name. Never headline + About alone.
- "Recurring subjects" counts only theme tags seen twice or more.
- Chips: carried = solid border, green dot; partial = solid border, amber dot; missing = dashed border, hollow dot. Colour is never the only signal.
- Amber on the presence-health bars is `#9A6B00` (3:1 on the `#E2E7EE` track). The `#E0A82E` amber is only for dots on white.
- `profile_copy_drafts` records `copied_at`/`copied_text`/`copied_angle` when a member copies, plus `source_headline`/`source_about`. `applied_at` is set ONLY by `linkedin-fetch-profile` on the next read, when the live field matches the copied text at similarity >= 0.8. Copying is never treated as applying.
- Edit distance for edge functions lives in `supabase/functions/_shared/editDistance.ts` — one copy only.
- `scorePresence` rules are templated with the member's own figures and name the branch that actually fired; a strong row returns an empty rule rather than a generic scold.
