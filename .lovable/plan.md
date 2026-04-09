

## Fix: Retake buttons for Evidence Audit and Brand Assessment not clickable

### Problem
The "Retake" buttons for Evidence Audit and Brand Assessment in `OnboardingProfileSection.tsx` (lines 379 and 395) have no `onClick` handlers — they are inert `<button>` elements that do nothing when clicked.

The modals (`ObjectiveAuditModal` and `BrandAssessmentModal`) are controlled by state in the parent `IdentityTab` component, but no callbacks are passed down to `OnboardingProfileSection`.

### Plan

**File 1: `src/components/OnboardingProfileSection.tsx`**
- Add two optional callback props: `onRetakeAudit` and `onRetakeBrand`
- Wire the "Retake" button for Evidence Audit (line 379) to call `onRetakeAudit`
- Wire the "Retake" button for Brand Assessment (line 395) to call `onRetakeBrand`

**File 2: `src/components/tabs/IdentityTab.tsx`**
- Pass `onRetakeAudit={() => setAuditOpen(true)}` and `onRetakeBrand={() => setBrandOpen(true)}` to the `<OnboardingProfileSection />` component on line 75

### What stays the same
Everything else — no changes to modals, assessments, data, other tabs, or any other components.

