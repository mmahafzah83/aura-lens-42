## AuraButton audit (read-only — no code changed)

Component: `src/components/ui/AuraButton.tsx` (inline-style button, variants `primary | secondary | signal | ghost | danger`, sizes `sm | md | lg`, props `onClick, disabled, loading, className, type, style`).
Canonical: `src/components/ui/button.tsx` (cva/Tailwind, variants `default | destructive | outline | secondary | ghost | link`, sizes `default | sm | lg | icon`, props `asChild, loading`, full native button props).

**11 consumer files, 26 usages** (plus the component file itself). Note: `AskAuraButton` in `Dashboard.tsx` is a different component and is out of scope.

### Mechanical (drop-in)

| File | Uses | Props |
|---|---|---|
| src/components/FirstLoginWelcome.tsx | 1 | variant primary, size sm, onClick |
| src/components/identity/BrandReportSection.tsx | 1 | variant primary, size sm, onClick |
| src/components/identity/ReportViewerSection.tsx | 2 | primary/sm, onClick, loading, disabled |
| src/components/settings/AccountPanel.tsx | 1 | primary/sm, onClick, disabled |
| src/components/NpsSurveyModal.tsx | 1 | defaults (primary/md), onClick, disabled |

All map as: `primary → variant="default"`, `md → size="default"`, `loading`/`disabled` pass through unchanged.

### Needs judgement

| File | Uses | Props | Why it doesn't map cleanly |
|---|---|---|---|
| src/pages/Settings.tsx | 9 | primary, ghost (incl. a computed `variant={cond ? "ghost" : "primary"}`), sm, loading, disabled, 2 inline `style` overrides | Two danger buttons are styled by inline `style` (`color: var(--error)`, `background: var(--error)`, `borderColor`) rather than a variant — should become `variant="destructive"` / `outline` + error classes, a semantic decision. `ghost` here renders **with a border** (AuraButton ghost = bordered) so it maps to `outline`, not `ghost`. |
| src/components/tabs/ImpactTab.tsx | 4 | primary md, `signal` variant, sm, loading, inline `style={{borderRadius:6, padding:"12px 26px"}}`, inline `<Linkedin>` icon in children | `signal` variant (`var(--signal)` background) has **no canonical equivalent**; radius/padding overrides fight the cva size classes; icon child relies on manual `mr-2 inline` instead of Button's `gap-2` + `[&_svg]:size-4`. |
| src/components/SilenceAlarm.tsx | 3 | primary/ghost, sm, inline `style={{borderRadius:4, padding:"7px 18px"}}` | Deliberate squared-off geometry (radius 4) that no canonical size provides; needs a decision to normalise or keep via `className`. |
| src/components/home/WeekReadyCard.tsx | 2 | `signal` variant, ghost, sm, disabled | `signal` variant has no canonical equivalent; the busy state is hand-rolled (`<Loader2 className="animate-spin"/>` + text inside children with `disabled={preparing}`) instead of the `loading` prop — needs conversion, not substitution. |
| src/components/HelpPanel.tsx | 1 | `secondary`, `style={{width:"100%"}}` | AuraButton `secondary` = brand-tinted (`--brand-ghost` / `--brand` / `--brand-line`); canonical `secondary` = neutral `--surface-subtle`. Visually different — likely wants `variant="outline"` or a brand treatment. Full-width needs `className="w-full"`. |
| src/components/tabs/AuthorityTab.tsx | 1 | primary, **size lg**, loading, long onClick | Only `lg` consumer; AuraButton `lg` (14/28px, radius 10, no min-height) vs canonical `lg` (h-12, px-8, text-base). Hero CTA — worth an eyeball check after swap. |

### Other cross-cutting notes
- No usage anywhere uses `asChild`, `type="submit"`, `className`, or link-wrapping — so no Slot/anchor complications.
- Canonical Button disabled opacity is `0.60` vs AuraButton's `0.4`; every disabled state changes appearance slightly across all 26 usages.
- AuraButton has no focus ring; canonical adds `focus-visible:ring-2` — an accessibility improvement, not a regression.
- AuraButton's loading spinner **replaces** the label; canonical's spinner sits **beside** it. Labels will appear during loading after migration (10 usages pass `loading`).

### Decision this feeds
The batch **must be split**. Run one uniform mechanical batch over the 5 files above (5 usages), then a second pass for the 6 judgement files (21 usages) — gated on two prior decisions: (a) what `signal` becomes canonically (new cva variant vs `default`), and (b) whether the squared radius-4/6 overrides in SilenceAlarm/ImpactTab survive or normalise to canonical radii.
