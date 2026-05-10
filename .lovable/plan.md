# Auth Recovery v3 — Implementation Plan

Snapshot `pre-auth-recovery-v3` will be taken before changes; `post-auth-recovery-v3` after.

## Part 1 — Onboarding Step 0: Set Password
**File:** `src/pages/Onboarding.tsx`
- On mount, fetch `supabase.auth.getUser()` and check `user.user_metadata.password_set`.
- If false/missing, prepend a Step 0 ("Secure your account") to the existing flow with same card style as Unboxing card. Two password inputs with eye toggle, validation (≥8 chars, match), bronze CTA.
- On submit: `supabase.auth.updateUser({ password })` then `updateUser({ data: { password_set: true } })`, fire `send-account-notification` (type `password_set`, non-blocking), advance to Step 1.
- If already set, skip directly to Step 1 (no flicker — render nothing until the check completes).

## Part 2 — Welcome email after assessment
**File:** `src/pages/Onboarding.tsx` (assessment completion handler)
- After Brand Assessment success and just before navigating to `/home`, invoke `send-lifecycle-email` with `{ user_id, email_type: 'welcome' }` (non-blocking try/catch). Dedup is handled server-side.

## Part 3 — /auth password recovery
**File:** `src/pages/Auth.tsx`
- Replace existing forgot-password call with `supabase.functions.invoke('send-password-reset', { body: { email } })`. Always show generic success toast.
- Add `onAuthStateChange` listener: if `event === 'PASSWORD_RECOVERY'` → set `showNewPasswordForm` true.
- New password form (two inputs + eye toggles, bronze CTA). On submit: `updateUser({ password })`, then `updateUser({ data: { password_set: true } })`, fire `send-account-notification` (type `password_changed`, non-blocking), `navigate('/home')`.

## Part 4 — New EF `send-password-reset`
**File:** `supabase/functions/send-password-reset/index.ts` + `config.toml` `verify_jwt = false`
- Service-role client → `auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://aura-intel.org/auth' } })`.
- Lookup `diagnostic_profiles.first_name` and brand color from active `design_system` row.
- Build branded HTML (Cormorant Garamond heading, DM Sans body, Horizon Eye SVG, bronze CTA, 1-hour expiry note).
- Send via Resend from `Aura <invites@aura-intel.org>`, reply-to `mohammad.mahafdhah@aura-intel.org`. Always return `{ success: true }` (don't leak existence).

## Part 5 — New EF `send-account-notification`
**File:** `supabase/functions/send-account-notification/index.ts` + `config.toml` `verify_jwt = false`
- Body: `{ type, email, first_name? }`. Switch on `password_set` and `password_changed` for subject/heading/message/CTA/warning blocks.
- Same branded template (Horizon Eye, brand color from `design_system`). Resend from `invites@aura-intel.org`.

## Part 6 — Fix `submit-waitlist`
**File:** `supabase/functions/submit-waitlist/index.ts`
- Change sender from `onboarding@resend.dev` → `invites@aura-intel.org`.
- Replace plain `text` with branded HTML template (Horizon Eye header, "You're on the list, {name}.", body copy, footer). Keep all existing validation, rate-limit, dedup, and DB insert logic untouched.

## Part 7 — Admin re-invite button
**File:** `src/pages/Admin.tsx` (and/or `src/components/BetaAccessAdmin.tsx` — whichever renders the beta users list)
- Add small outline button "Re-invite" per row → `supabase.functions.invoke('send-invite', { body: { email, name } })` with success/error toasts.

## Deploy
Deploy `send-password-reset`, `send-account-notification`, `submit-waitlist` via deploy_edge_functions after writing.

## Out of scope (do not touch)
`send-invite`, `send-lifecycle-email`, `send-weekly-brief`, `colleague-invite` logic; existing onboarding Steps 1–4 content; DB schema; other pages.

## Self-check
Run the grep checks listed in the prompt at the end.
