# The retired headline — audit first, then a single source

## What each of the twelve hits actually does

**(1) Live page headline — visible on screen**
- `src/pages/Mirror.tsx:512` — the `<h1>` of the Mirror ask state. Pure headline, no surrounding story. Safe to swap.

**(2) Report cover slogan — printed on the paper**
- `src/components/report/AuraPaper.tsx:297` — italic serif slogan on the report cover band. Standalone span. Safe to swap.

**(3) Meta tags — invisible, but crawled**
- `index.html:5` meta description, `:33` og:description, `:41` twitter:description, `:51` JSON-LD description. All four are the retired pair, sometimes with a trailing "Capture what you read…" clause.
- `src/pages/OurStory.tsx:43` — `usePageMeta` description.
- `src/pages/OurStory.tsx:51` — the same sentence again inside the Article JSON-LD block. Not prose: line 43 and 51 are duplicates of one meta string. Nothing narrates the old line, so nothing breaks — but it must be one constant used twice, not two edits.
- `src/pages/AcceptInvitation.tsx:17` — page meta description; the sentence is embedded mid-paragraph ("…an AI professional identity platform. Your expertise is invisible; Aura fixes that. Accept your invitation…"). Needs a rewritten sentence, not a token swap.

**(4) Ceremony / share caption — user-authored text**
- `src/components/TierCeremonyModal.tsx:375` — inside the English LinkedIn caption the member posts: "If you're a senior professional whose expertise is invisible to the market". This is prose in the member's voice, a clause not the headline. Swapping the headline in would break the sentence. Leave literal or rewrite by hand.

**(5) Doc / reference, not runtime**
- `public/llms.txt:3` — crawler-facing prose paragraph.
- `public/admin/aura-standard-v2.html:421` — the brand-standard doc quoting the old headline pair as a law. It documents history; rewriting it silently loses the record.
- `src/constants/language.ts:23` — a comment in the rules block, not a string.

## Proposed fix

### One constant file
In `src/constants/language.ts`, add an exported block:

```ts
export const BRAND = {
  HEADLINE: "Your experience is worth more than your profile shows.",
  DESCRIPTOR: "AI Professional Identity Platform",
} as const;
```

`HEADLINE` is the live headline. `DESCRIPTOR` is the category line that replaces "Strategic Intelligence OS".

### Who imports it (4 of 12 become imports)
| File | Change |
| --- | --- |
| `src/pages/Mirror.tsx:512` | `{BRAND.HEADLINE}` |
| `src/components/report/AuraPaper.tsx:297` | `{BRAND.HEADLINE}` |
| `src/pages/OurStory.tsx:43 & :51` | one local `const DESC = \`Why Aura exists, from the founder. ${BRAND.HEADLINE} …\``, used in both places |
| `src/pages/AcceptInvitation.tsx:17` | rewritten sentence built from `BRAND.DESCRIPTOR` + `BRAND.HEADLINE` |

That is four files, five hits, all importing.

### Who stays literal (7 of 12)
| File | Why |
| --- | --- |
| `index.html` ×4 | Static HTML, no module graph. Manual mirror. |
| `public/llms.txt` | Static text asset. Manual mirror. |
| `public/admin/aura-standard-v2.html:421` | Brand-standard record; quoting the retired pair is the point. Optionally annotate as retired. |
| `TierCeremonyModal.tsx:375` | Prose clause in the member's share caption, not the headline. Hand-rewrite only if you want it changed. |
| `language.ts:23` | Comment text, not copy. |

### Keeping index.html and llms.txt in sync — my recommendation
**Comment-marked manual mirrors, not a build-time replace.** A Vite transform for two static files adds a build step that can silently no-op on a Netlify/preview path, and the failure is invisible (stale meta shipped, no error). Instead:

- Put a marker comment above each block:
  `<!-- AURA BRAND MIRROR — keep in sync with BRAND.HEADLINE in src/constants/language.ts -->`
  and a `# AURA BRAND MIRROR — …` line in `llms.txt`.
- Add a short note in the `language.ts` header: "two manual mirrors: index.html, public/llms.txt".

If you'd rather have it enforced, the cheap version is a check (not a replace): a tiny script that greps both files for `BRAND.HEADLINE`'s value and fails if missing. Say the word and I'll add it instead of the comments.

## Count
- 5 hits across 4 files become imports.
- 7 hits stay literal (4 meta tags in `index.html`, `llms.txt`, brand-standard doc, ceremony caption, plus the comment in `language.ts` which is a 13th non-string).
- No hardcoded copy of the headline remains anywhere in `src/`.
