# Batch 12b: Arabic server-output safeguards

## Scope
- Preserve rollback revision `283a350218b6cf41b2ebbeeeaf459af17692783f`.
- Recover and report the four exact Batch 12 Arabic model outputs; rerun only if unavailable.
- Extend the one shared Arabic instruction block and checker for Arabic industry/sector names and banned standalone technical tokens.
- Make Arabic Home daily-card prose use Arabic evidence lines, the shared voice block, one correction, then an evidence-only Arabic fallback.
- Leave English behavior unchanged and do not write member data or send email.

## Verification
- Add unit coverage for both checker additions, the Arabic Home gate, and its fallback.
- Run typecheck, vocabulary check, full unit tests, and build with separate exit codes.
- Run one direct, non-writing Home model check on the founder’s existing data and report the output.

## Technical details
- Keep Home’s existing deterministic fact gathering and selection. Add language-specific evidence construction and validation without altering its English constants or path.
- The Arabic gate will classify standalone `AI`, `KPI`, `KPIs`, `dashboard`, `roadmap`, and `stakeholders` as a dedicated violation while allowing proper names.
- Arabic Home model prose must reproduce only supplied Arabic evidence; failed correction falls back to `هذا ما تغيّر منذ أمس:` plus those evidence lines.
