
# Wave A6 — Decorative color debt closure

Scope: presentation-only. No logic, no feature changes. Four files touched.

---

## 1. Six tint fixes (adjudicated in A5.1)

### `src/components/MarketMirror.tsx`
- **L244** `background: "rgba(249,115,22,0.04)"` → `background: "color-mix(in srgb, var(--signal) 4%, transparent)"`

### `src/components/CaptureModal.tsx`
- **L722** `background: "radial-gradient(circle, rgba(176,141,58,0.25) 0%, transparent 65%)"` → `…color-mix(in srgb, var(--bronze) 25%, transparent) 0%, transparent 65%…`
- **L949** `background: active ? "rgba(255,255,255,0.15)" : "var(--vellum)"` → `active ? "var(--hairline)" : "var(--vellum)"` — visual check on dark: active tab must remain distinguishable; if it loses contrast, fall back to `color-mix(in srgb, var(--ink) 12%, transparent)` and note.
- **L1094** `rgba(239,159,39,0.1)` → `var(--warning-pale)`
- **L1095** `border: "1px solid rgba(239,159,39,0.4)"` → `border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)"`
- **L1419** `"0 4px 20px rgba(184,48,37,0.4)" /* danger glow */` → `"0 4px 20px color-mix(in srgb, var(--error) 40%, transparent)" /* danger glow */`

Quote before/after for each in the report.

---

## 2. `src/pages/RequestAccess.tsx` — token pass (public, pre-invite page)

Page is currently fully dark-first with literal hex/rgba throughout. Single file, presentation-only.

Mapping (apply Wave A grammar):

| Constant / line | From | To |
|---|---|---|
| `BRONZE` (L10) | `#B08D3A` | keep as `var(--bronze)` reference where used inline; for non-CSS-var contexts (already a TS const) annotate `// mirrors --bronze` |
| `LEFT_BG` L11 `#0a0a08`, `RIGHT_BG` L12 `#0f0e0c` | hex | `var(--paper)` / `var(--paper-2)` (or single-source as constants annotated to the matching dark-surface token) |
| `FIELD_BG` L13 `#1a1917`, `FIELD_BORDER` L14 `#2a2a28` | hex | `var(--vellum)` / `var(--hairline)` |
| Body / muted text `#ededed`, `#aaa`, `#999`, `#bdbdbd`, `#9a9a9a`, `#888`, `#666`, `#555` | hex | `var(--ink)` / `var(--ink-2)` / `var(--ink-muted)` / `var(--ink-5)` per existing ink scale |
| Heading `#fff` (L142, L212, L426, L483) | hex | `var(--ink)` |
| Error block L267–269 `rgba(220,70,70,0.1)`, `rgba(220,70,70,0.4)`, `#e89c9c` (also L493) | hex/rgba | `var(--error-pale)` bg, `color-mix(in srgb, var(--error) 40%, transparent)` border, `var(--error)` text |
| Submit button L280 `#fff` | hex | `var(--ink-on-brand)` |
| Footer link L299 `#D4B056` | hex | `var(--bronze-text)` |
| Placeholder L297 `rgba(255,255,255,0.45)` | rgba | `var(--ink-muted)` |
| Focus ring L519 `rgba(176,141,58,0.15)` | rgba | `color-mix(in srgb, var(--bronze) 15%, transparent)` |
| Autofill L528–529 `#ededed` | hex | `var(--ink)` (kept as literal if `!important` CSS block can't read vars — annotate) |
| Hover shadow L535 `rgba(176,141,58,0.2)` | rgba | `color-mix(in srgb, var(--bronze) 20%, transparent)` |
| Select option bg/text L403–405 `#555`, `#ededed` | hex | `var(--ink-muted)` / `var(--ink)` |

`✦` marks (L164, L178, L423): add `aria-hidden="true"` (D2.4 register). L178 sparkle is inside Arabic copy text node — wrap in `<span aria-hidden="true">✦</span>`.

Note any literals that must stay (e.g., inside the `<style>` autofill block where CSS vars don't resolve in `-webkit-text-fill-color` reliably); annotate with `/* mirrors --ink */`.

---

## 3. GRAMMAR-1 flip in `src/index.css`

Currently (3 occurrences across themes):
```
--danger-pale: <hex>;
--error-pale:  var(--danger-pale);
```

Flip to canonical:
```
--error-pale:  <hex>;       /* canonical */
--danger-pale: var(--error-pale);  /* legacy alias — migrate consumers */
```

Apply at L157–158 (dark `:root`), L258–259 (light), L1240–1241 (legacy/admin block). Values unchanged.

**`--danger-pale` consumers to migrate later** (not in this wave):
- `src/components/AurasRead.tsx:26` — `bg: "var(--danger-pale)"` → `var(--error-pale)`

(Single consumer. Could be migrated in this same touch if desired — recommend yes, then leave the alias for any drift.)

---

## 4. `--color-info-text` check

`rg -n 'var\(--color-info-text' src/` → 5 consumers:
- `AurasRead.tsx:35` (no fallback)
- `home/YourMoves.tsx:36`, `home/MarketScan.tsx:96`, `tabs/HomeTab.tsx:1788, 1884` (all with `var(--info)` fallback)

Definition: `src/index.css:1259  --color-info-text: #185FA5;` — defined **only in one block** (legacy/admin), not in the dark/light theme roots. AurasRead.tsx has no fallback → renders empty/inherited outside that block.

**Fix:** define `--color-info-text` in both theme roots alongside `--info`:
- dark `:root` (~L130 area): `--color-info-text: <info-on-dark hex matching §1>;`
- light block (~L240 area): `--color-info-text: <info-on-light hex>;`

This is the minimal, non-breaking choice (preserves the semantic distinction "info text vs. info accent"). Alternative — simplify all 5 call sites to `var(--info)` and delete the token — is broader and changes intent; **not recommended** in this wave.

---

## Self-check (to paste in report)

1. `rg -n 'rgba\(249,115,22,0.04\)|rgba\(176,141,58,0.25\)|rgba\(255,255,255,0.15\)|rgba\(239,159,39|rgba\(184,48,37' src/components/MarketMirror.tsx src/components/CaptureModal.tsx` → expect zero.
2. `rg -n '#[0-9a-fA-F]' src/pages/RequestAccess.tsx` → quote residue with justification (expected: autofill `-webkit-text-fill-color` literals only, annotated).
3. `tsc --noEmit` exit code, real output.
4. Dark screenshots of (a) RequestAccess hero + form, (b) CaptureModal warning row, (c) MarketMirror gap card, (d) CaptureModal tab row (verify active state still reads). Owner verifies light mode in preview.

## Out of scope (parked, registered)

- SEMANTIC-1 (`--semantic-warning` alias hygiene) — park to next token-file touch.
- AdminDesignSystem fallbacks, App.css legacy, qaInteractionAudit.ts strings — park.
- cardStyles / CarouselStudio export palette constants — already single-sourced & annotated in A5.
