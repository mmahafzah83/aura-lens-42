# Audit interpretation flow — diagnosis (read-only)

## Direct answer

**No.** When a user completes the `self_calibration` audit, the app does **not** call `audit-interpretation` and does **not** write `diagnostic_profiles.audit_interpretation`. There is no code path (broken or otherwise) that was wired to do this for `self_calibration`. The interpretation generator is physically nested inside the `evidence_audit` results component and only mounts on that branch.

---

## 1. Call sites of `audit-interpretation`

Exactly one call site in `src/`:

- `src/components/AuditResultsView.tsx:155`
  ```
  const res = await supabase.functions.invoke("audit-interpretation", {
    body: { scores },
  });
  ```
  Inside `useEffect` at line 148, fires on mount of `AuditResultsView`.

**Is this call inside a branch that only runs for one audit method?** Yes — indirectly. `AuditResultsView` has only one import/render site:

- `src/components/ObjectiveAuditModal.tsx:195` renders it, guarded by `showResults` (set true after `handleSubmit` at line 91).
- `ObjectiveAuditModal.handleSubmit` writes `audit_method: "evidence_audit"` (line 75).

So `AuditResultsView` — and therefore the `audit-interpretation` invoke — is reachable **only** from the evidence_audit flow.

## 2. Writes to `diagnostic_profiles.audit_interpretation`

Exactly one write site in `src/`:

- `src/components/AuditResultsView.tsx:164–170`
  ```
  await supabase.from("diagnostic_profiles")
    .update({
      audit_results: scores,
      audit_interpretation: text,
      audit_completed_at: ...,
    })
    .eq("user_id", session.user.id);
  ```
Runs inside the same `useEffect` immediately after the invoke succeeds. Same reachability: evidence_audit only.

Other appearances of `audit_interpretation` in `src/` are read-only:
- `src/integrations/supabase/types.ts:678,724,770` — generated types.
- `src/lib/buildIdentityReport.ts:200` — SELECT list only.

## 3. Per-audit-method trace

**`self_calibration` path** (`src/pages/Onboarding.tsx`)
- `CalibrationSliders` rendered at `Onboarding.tsx:1399` with `onComplete={handleCalibrationComplete}`.
- `handleCalibrationComplete` (lines 610–645):
  ```
  await supabase.from("diagnostic_profiles").update({
    skill_ratings: scores,
    audit_results: scores,
    generated_skills: generatedSkills,
    audit_completed_at: ...,
    audit_method: "self_calibration",
  }).eq("user_id", userId);
  await saveProgress(2);
  goStep(2);
  ```
  - (a) Calls `audit-interpretation`? **No.**
  - (b) Persists `audit_interpretation`? **No.**
  - No downstream component in this flow renders `AuditResultsView` either — the user advances straight to step 2 (brand assessment).

**`evidence_audit` path** (`src/components/ObjectiveAuditModal.tsx`)
- Entered from `home/AuditCtaCard.tsx:156` and `tabs/IdentityTab.tsx:1245`.
- `handleSubmit` (lines 55–77): writes scores + `audit_method: "evidence_audit"`, then sets `showResults = true` (line 91).
- On show, `AuditResultsView` (line 195) mounts → its `useEffect` (line 148) invokes `audit-interpretation` (line 155) and writes `audit_interpretation` (line 167).
  - (a) Calls `audit-interpretation`? **Yes.**
  - (b) Persists `audit_interpretation`? **Yes.**

## 4. `primary_strength` and `identity_intelligence` writes

Neither field is written by either audit's completion handler in client code.

Client-side writes found (grep `identity_intelligence:` / `primary_strength:` with a colon, excluding types/selects):

- `src/components/ProfileIntelligence.tsx:132` — manual profile edit UI (`update({ identity_intelligence: updated })`).
- `src/pages/EditionStudio.tsx:156`, `src/pages/CarouselStudio.tsx:2237`, `src/pages/Settings.tsx:271`, and `broadsheet/{BroadsheetSlideSVG,ExplainerPage,QASheetPage}.tsx` — all write only the `.publication` sub-key for edition/carousel metadata, unrelated to audits.
- `src/components/tabs/IdentityTab.tsx:239` — literal `null` placeholder in a default state object, not a DB write.

No client write of `primary_strength` at all (only reads/selects/labels). The `evidence_audit` path does invoke `brand-assessment` after submit (`ObjectiveAuditModal.tsx:103`, non-blocking, with `auditScores`), which is the likely server-side populator of `primary_strength` / `identity_intelligence`, but that is not visible from `src/` and is not called by `handleCalibrationComplete`.

**Runs for both methods?** No. The `brand-assessment` re-run in `ObjectiveAuditModal.tsx:103` fires only on evidence_audit. The self_calibration completion handler has no equivalent invoke. (A separate `brand-assessment` call almost certainly runs during onboarding's step-2 brand assessment for all users — verifying that would require reading `Onboarding.tsx` step 2 and the edge function, which the current prompt scoped out.)

## Summary matrix

```
                          self_calibration   evidence_audit
audit-interpretation call        no               yes  (AuditResultsView.tsx:155)
writes audit_interpretation      no               yes  (AuditResultsView.tsx:167)
brand-assessment re-run          no               yes  (ObjectiveAuditModal.tsx:103)
sets audit_method                yes              yes
```

## Proposed next step (not executed)

If parity is desired, the minimal fix is to invoke `audit-interpretation` from `Onboarding.handleCalibrationComplete` (around `src/pages/Onboarding.tsx:631`) and include `audit_interpretation: text` in the same update payload. Approve this plan and switch to build mode if you want that implemented — otherwise treat this as diagnosis only.
