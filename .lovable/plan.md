

## Fix: Brand Assessment and Evidence Audit modals appear at top of page instead of centered

### Root Cause
`BrandAssessmentModal` renders its fixed-position overlay directly inside the component tree (no `createPortal`). If any ancestor element has a CSS `transform`, `filter`, or `will-change` property, the browser treats that ancestor as the containing block for `position: fixed` — breaking the centering.

`ObjectiveAuditModal` already uses `createPortal(... , document.body)` which avoids this issue, but both modals should be consistent.

### Fix

**File: `src/components/BrandAssessmentModal.tsx`**
- Import `createPortal` from `react-dom`
- Wrap the entire modal return (overlay + modal container) in `createPortal(..., document.body)` — same pattern as `ObjectiveAuditModal`
- No other changes to content, questions, styling, or functionality

This is a one-line import + wrapping the existing JSX return. Nothing else changes.

