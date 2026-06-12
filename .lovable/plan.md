## Scope
Replace every display-string occurrence of "Mahafzah" with "Mahafdhah" in exactly eight locations across `src` and `supabase/functions`. Do not touch any `from` or `reply_to` email address — those are already correct and remain byte-identical.

## Changes

### Frontend pages
- `src/pages/RequestAccess.tsx` line 470 — signature block display name
- `src/pages/PublicWelcome.tsx` line 800 — footer display name
- `src/pages/Landing.tsx` line 535 — founder bio paragraph

### Edge Functions (email template display names only)
- `supabase/functions/submit-waitlist/index.ts` line 202 — signature in waitlist confirmation email
- `supabase/functions/colleague-invite/index.ts` line 150 — signature in colleague invite email
- `supabase/functions/send-invite/index.ts` line 217 — signature in invite email
- `supabase/functions/send-decline-email/index.ts` line 35 — signature in decline email

### Component placeholder
- `src/components/ProfileManagement.tsx` line 252 — `placeholder="e.g., Mahafzah"` → `placeholder="e.g., Mahafdhah"`

## Out of scope
- Email addresses (`mahafdhah@aura-intel.org` and any other `from`/`reply_to` values)
- Any other files not listed above

## Verification
- Case-insensitive `rg "Mahafzah"` across `src/` and `supabase/functions/` returns zero matches after the change.
- Each changed line is listed in the implementation summary.
- Confirm no line containing an email address was modified.