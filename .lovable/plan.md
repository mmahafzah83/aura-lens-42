## Goal

One pipeline — Request Access. Frontend and edge function disagree on `Partner`, the personal-email hint nags users we want to welcome, and any 4xx response collapses into a misleading "Didn't connect" banner. Fix all three with the smallest possible surface area.

## Changes

### 1. New shared constant — `src/constants/seniority.ts`

Mirror the `sectors.ts` pattern.

```ts
export const SENIORITY_LEVELS = [
  "C-Suite",
  "SVP / EVP",
  "VP",
  "Partner",
  "Senior Director",
  "Director",
  "Senior Manager",
  "Manager",
  "Principal / Fellow",
  "Advisor / Board Member",
  "Other",
] as const;

export type SeniorityLevel = typeof SENIORITY_LEVELS[number];
```

### 2. `src/pages/RequestAccess.tsx`

- Line 5: add `import { SENIORITY_LEVELS } from "@/constants/seniority";` next to the existing `SECTORS` import.
- Lines 25–37: delete the local `SENIORITY` array. Replace the single usage site at line 257 with `options={[...SENIORITY_LEVELS]}` (matches the `SECTOR` spread pattern at line 39).
- Lines 42–50: delete `PERSONAL_DOMAINS` and `isPersonalEmail`.
- Line 95: delete `const [emailTouched, setEmailTouched] = useState(false);`.
- Line 96: delete the `showPersonalWarning` computation.
- Lines 250–251 (`<Field id="email" …>`): remove the `onBlur={() => setEmailTouched(true)}` and `hint={showPersonalWarning ? … : undefined}` props.
- `Field` component (lines 355–385): leave the `onBlur` and `hint` props in the signature — they remain a generic field API and removing them would broaden the diff for no benefit. Only the email call-site stops passing them.
- `handleSubmit` (lines 109–129): split the catch into a network-vs-4xx branch, and add a `"validation"` status with a single field-level error message.

  ```ts
  type Status = "idle" | "loading" | "success" | "duplicate" | "error" | "validation";

  // …
  try {
    const { data, error } = await supabase.functions.invoke("submit-waitlist", {
      body: { name: name.trim(), email: email.trim(), seniority, sector },
    });
    if (error) {
      // FunctionsHttpError exposes the EF response; FunctionsFetchError is a real network failure.
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        let efMsg = "";
        try { efMsg = (await ctx.json())?.error ?? ""; } catch { /* fall through */ }
        setValidationMessage(
          typeof efMsg === "string" && efMsg.trim()
            ? efMsg
            : "Please check the highlighted fields and try again.",
        );
        setStatus("validation");
        return;
      }
      throw error; // true network / unknown — falls into the catch below
    }
    // …existing success / duplicate handling…
  } catch (err) {
    console.error("submit-waitlist failed:", err);
    setStatus("error");
  }
  ```

  Add `const [validationMessage, setValidationMessage] = useState("");` next to the other state.

- Banner block (lines 274–283): keep the existing "Didn't connect. Try once more." banner gated on `status === "error"`. Add a sibling banner gated on `status === "validation"` that renders `validationMessage` using the same neutral/warning styling (reuse `--error-pale` / `--error`, or a softer `--warning` token if present — pick whichever already exists; do not introduce a new token).

### 3. `supabase/functions/submit-waitlist/index.ts`

- Above `ALLOWED_SENIORITY` (line 26), add the comment line:
  ```ts
  // MUST mirror src/constants/seniority.ts (SENIORITY_LEVELS) — keep byte-identical.
  ```
- Update the array to match `SENIORITY_LEVELS` exactly (insert `"Partner",` after `"VP",`):
  ```
  "C-Suite", "SVP / EVP", "VP", "Partner", "Senior Director", "Director",
  "Senior Manager", "Manager", "Principal / Fellow",
  "Advisor / Board Member", "Other"
  ```
- `ALLOWED_SECTOR` (lines 39–56) is unchanged. No other EF logic touched (email regex, rate limit, duplicate check, Resend email).

## Out of scope

- DB schema, migrations, RLS on `beta_allowlist`.
- Other surfaces that reference seniority strings (none found outside these two files).
- Visual redesign of the form or banners.
- The `BronzeNotice`/`SuccessCeremony` flows.
- The "Mahafzah → Mahafdhah" display-string fixes (separate ticket).

## Verification

1. **Byte-identical lists.** Diff the seniority strings between `seniority.ts` and `submit-waitlist/index.ts` — must be identical character-for-character (same quotes, same order, same trailing comma style).
2. **Live submit as Partner.** Use a fresh email, level `Partner`, any sector. Expect: success banner; row appears in `beta_allowlist` with `seniority='Partner'`, `status='pending'`, `source='waitlist'`. Verified via `psql` SELECT against `beta_allowlist` ordered by `created_at DESC LIMIT 1`.
3. **Validation surfacing.** Submit with a body that bypasses client-side validation (e.g. devtools) sending `seniority="Bogus"`. Expect the new validation banner with the EF's exact message ("Valid seniority is required") — not "Didn't connect".
4. **Network failure path.** Block the function URL in devtools (offline mode). Expect "Didn't connect. Try once more." — unchanged behavior.
5. **Personal-email hint gone.** Type `you@gmail.com`, blur the field. No hint should render. `rg "PERSONAL_DOMAINS|isPersonalEmail|showPersonalWarning|emailTouched"` across `src/` must return zero matches.
6. **No regressions in sector dropdown.** Sector list still renders 16 entries from `SECTORS`.
