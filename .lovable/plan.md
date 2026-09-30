# Writer time-budget check (read-only findings, nothing to build)

1. Deployed function: the deploy call last turn reported success. The logs cannot confirm which version is running, because nothing has called the function since. The code on disk has every change: one "corrective" call, the 60s skip (line 1484), one hardened retry (1256–1257), gate_budget (1605–1607), model_calls/total_ms in meta (1779), and the one-line Arabic list rule (96).
2. Studio screen: live. The latest preview build is OK (12:15 UTC). StudioPanel.tsx polls 20 times every 3s (lines 1426–1427), with the 120s abort kept.
3. Logs: none since the deploy. No boot errors, runtime errors or TypeErrors, and no runs at all.
4. Undefined paths: none found.
   - preGate and unsourcedEntities inside the corrective block are block-scoped and not used afterwards.
   - unsourced, unsourcedEntities and integrity are always set from `a`, which is either the first draft's result or the better second one.
   - warnings, rotationRepeat, voiceFidelityFlags and voiceMatch are declared before the block with safe defaults, and set from `a.v` after it.
5. Not confident about:
   - No live Write has run yet, so the ~100s target and the first-boot behaviour are unproven.
   - voiceMatch is scored from the first draft (line 1428). Whether it is re-scored when the second draft wins needs a check in the lines after 1520.
   - When the 60s skip fires, the first draft's failures fall through to the sentence-stripping guard, as intended, but this is untested live.

Suggested next step: run one Arabic and one English Write, then read operation_runs meta (model_calls, total_ms) and these logs.
