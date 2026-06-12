
# Fix: one theme contract across onboarding + brand assessment (v2)

Revised per feedback: text stays on the parchment primitives (`--ink` / `--bronze-text`), shadcn semantics are used only for sub-surfaces that lack a parchment equivalent. Adds a bottom scroll fade to the modal body.

## 1. Make `/onboarding` honour the user's light/dark preference

`applyThemeToRoot` currently only runs inside `Dashboard`, so `/onboarding` falls through to the dark `:root` block.

- Extract the existing logic from `src/pages/Dashboard.tsx` into `src/lib/applyTheme.ts` (no behaviour change, same `localStorage["aura-theme"]` key, same `"light"` default).
- Call it once at the top of `src/pages/Onboarding.tsx` (inside a `useEffect`, before first paint where possible). Dashboard keeps calling the same helper.
- Result: `/onboarding` and `/dashboard` resolve identically — both write `data-theme` on `<html>`.

## 2. Fix the off-by-one CTA copy

Single hardcoded string. `src/components/CalibrationSliders.tsx:497`:

```text
- Continue to step 4
+ Continue to step 3
```

No other logic touched.

## 3. BrandAssessmentModal — stay on the parchment contract for text, fix sub-surfaces, add scroll fade

The shell already uses `--paper` / `--ink` / `--ink-3` correctly. The ink scale flips with theme, so text migrates to those primitives (not shadcn). Shadcn semantics are used only for sub-surfaces that have no correct parchment equivalent.

Replacements in `src/components/BrandAssessmentModal.tsx`:

- Question number (`:585-594`) — `rgba(212, 176, 86, 0.4)` → `var(--bronze-text)` at full opacity. Brand bronze is intentional; the only bug was the 0.4 opacity rendering as a ghost on parchment.
- Question title `<h2>` (`:595-606`) — `rgba(230, 222, 205, 0.95)` → `var(--ink)`.
- Reveal archetype `<h2>` (`:971-997`) — `rgba(255, 250, 240, 0.96)` → `var(--ink)`.
- "Full picture" card (`:1054-1060`) — `background: var(--ink-2)` → `hsl(var(--card))`; `border: 1px solid var(--ink-3)` → `1px solid hsl(var(--border))`; any text inside that previously relied on the dark surface → `hsl(var(--card-foreground))`. (Shadcn used here because the parchment scale has no correct "raised card" surface token.)
- Sweep the same file for any other hardcoded `rgba(...)` cream/ink text values and migrate to the `--ink` scale (`--ink` / `--ink-2` / `--ink-muted`) using the existing ink hierarchy. Any further dark sub-surfaces follow the same `--card` / `--border` rule. Bronze accents stay.
- Fix the parallel "Step 4 of 5" eyebrow on `:511` to "Step 4 of 4" so all eyebrows agree.

**Scroll fade (new, in-scope):** the body region at `:527` (`flex-1 overflow-y-auto`) gets a bottom fade so users see content continues. No height or layout change.

- Wrap or position-relative the scroller's parent and add a sibling `::after`-style overlay (or a pointer-events:none absolute div) anchored to the bottom: ~32px tall, `background: linear-gradient(to bottom, transparent, var(--paper))`, `pointer-events: none`. Uses `--paper` so it flips with theme automatically.
- No JS scroll listener; static fade is sufficient and matches existing patterns.

## 4. Verification

- `localStorage["aura-theme"] = "light"`, hard-refresh `/onboarding`: Calibration, BrandAssessment intro, Question, and Reveal all render on parchment with legible ink text, no embedded dark cards, bronze accents readable.
- Toggle to `"dark"`: same screens render warm-dark with cream-equivalent ink text — current dark behaviour preserved by the ink scale.
- Step counter reads 1→2→3→4; Calibration finish button reads "Continue to step 3"; modal eyebrow reads "Step 4 of 4".
- Bottom scroll fade visible on the Question body in both themes; fade colour matches `--paper`.
- `rg -n "rgba\(230,222,205|rgba\(255,250,240" src/components/BrandAssessmentModal.tsx` → **zero matches**.
- tsc clean; no token additions to `index.css`.

## Out of scope

- Modal layout, container height, scroll behaviour beyond the bottom fade.
- Token palette changes.
- Refactor of `CalibrationSliders` step state — label only.
