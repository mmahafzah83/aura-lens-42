# 04 — Edge functions

Generated from `supabase/functions/*` on 2026-09-04T15:21:56.404Z. 166 functions in the repo.

**JWT** = `verify_jwt` from `supabase/config.toml`; when a function has no entry there the platform default (`true`) applies.
Functions with `verify_jwt = false` do their own authentication inside the handler (most read the `Authorization` header and call `auth.getUser()`, or check a cron/service secret).

## `account-brief`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Get user from auth header
- **Input payload:** `{ account }`
- **Output shape (JSON.stringify keys seen):** `{ account, synthesis_en: `No intelligence found for "${account }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: `You are Aura, an executive intelligence advisor for a ${persona }` / `{ error: "Rate limit exceeded. Please try again shortly." }` / `{ account, ...synthesis, entries_count: entryResults.length, docs_count: relevantDocs.length, }`
- **HTTP statuses returned:** 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `document_chunks`, `entries`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `activate-framework`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** ── Caller verification: require a valid Supabase JWT ──
- **Input payload:** `{ framework_id }`
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: systemPrompt }` / `{ error: "Unauthorized" }` / `{ error: "Forbidden" }` / `{ success: true, activations: inserted }`
- **HTTP statuses returned:** 401, 403, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `framework_activations`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/FrameworkBuilderInline.tsx`, `src/components/MyFrameworks.tsx`

## `admin-active-users`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Every auth account, paged in full — this is the source of truth for the admin Users tab. Allowlist rows are joined on for context only; an account with no allowlist row still appears.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Forbidden" }` / `{ error: `Could not read auth users: ${listErr.message }` / `{ users, total: users.length }`
- **HTTP statuses returned:** 401, 403, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `beta_allowlist`, `diagnostic_profiles`, `entries`, `user_roles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminAccess.tsx`

## `admin-console`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Plain-English explainers for the Issues panel. Each entry: what   — one sentence of what this job does for the user impact — one sentence of what breaks when it fails (who, what they won't see) action — one concrete next step for a junior admin Wording: plain English, no jargon, no banned words (authority/leverage/utilize/facilitate).
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ user_id: target }` / `{ user_id: target, email_type: requested }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_action_log`, `admin_settings`, `ai_usage_log`, `authority_voice_profiles`, `diagnostic_profiles`, `ef_faults`, `entries`, `lifecycle_emails`, `linkedin_post_metrics`, `linkedin_posts`, `score_snapshots`, `strategic_signals`
- **RPCs called:** `report_invariants`
- **Other functions invoked over HTTP:** `calculate-aura-score`, `send-lifecycle-email`
- **Called from:** `src/components/admin/ReportHealthPanel.tsx`, `src/pages/AdminJourney.tsx`, `src/pages/AdminPeople.tsx`

## `admin-delete-user`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** The database enforces the cascade on delete of an auth user — verified 2026-08-26.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_action_log`, `beta_allowlist`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminAccess.tsx`, `src/pages/AdminQA.tsx`

## `admin-digest`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** ===== COST =====
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ subject, body: html, severity: "info", dedupe_key, html: true, force_email: true, }` / `{ skipped: "email disabled" }`
- **HTTP statuses returned:** 200
- **Secrets / env read:** `ADMIN_DIGEST_EMAIL_ENABLED`, `CRON_SECRET`, `HEARTBEAT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_settings`, `ai_usage_log`, `api_health_checks`, `diagnostic_profiles`, `ef_faults`, `entries`, `influence_timeline`, `linkedin_connections`, `onboarding_article_log`, `ops_alerts`, `score_snapshots`, `source_registry`
- **RPCs called:** `admin_cron_failures_24h`, `admin_cron_runs_24h`
- **Other functions invoked over HTTP:** `admin-notify`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `admin-list-documents`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/admin-list-documents/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `documents`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `admin-notify`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/admin-notify/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ADMIN_ALERT_EMAIL`, `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ops_alerts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `admin-regenerate-report`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Mirrors splitInterpretation() in src/components/BrandAssessmentModal.tsx exactly. */
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "claude-sonnet-4-5-20250929", max_tokens: 8192, system: BRAND_ASSESSMENT_SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }` / `{ user_id: targetId, created_by: "admin" }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `capture-report-snapshot`
- **Called from:** `src/components/admin/RegenerateReportPanel.tsx`, `src/components/admin/ReportHealthPanel.tsx`

## `admin-send-test-email`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Mirror send-lifecycle-email's From address and Resend call exactly.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ from: FROM, to: [email], reply_to: REPLY_TO, subject, html, tags: [ { name: "user_id", value: uid }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `lifecycle_email_log`
- **RPCs called:** `is_current_user_admin`
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/admin/SendTestEmailPanel.tsx`

## `admin-set-document-type`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Invariant: if this document is not a CV, it has no cv_label. Fires whenever document_type is being set to anything other than 'cv', including null — otherwise "(unset)" strands the label behind.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `documents`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `analyze-image`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Load user profile to build dynamic persona
- **Input payload:** `{ image_base64, mime_type }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "image_base64 is required" }` / `{ error: "Rate limit exceeded." }` / `{ error: "AI credits exhausted." }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/CaptureModal.tsx`

## `analyze-linkedin-profile`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Only attempt fetch if user didn't provide text
- **Input payload:** `{ url, profileText: userProvidedText }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "A valid https LinkedIn profile URL is required (e.g. https://www.linkedin.com/in/username)" }` / `{ error: "Rate limit exceeded. Try again shortly." }` / `{ error: "AI credits exhausted." }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/LinkedInProfileAnalyzer.tsx`

## `analyze-potential`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Helper to fetch master frameworks for the user
- **Input payload:** `{ entries }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Entries are required" }` / `{ error: "Rate limit exceeded." }` / `{ error: "AI credits exhausted." }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/PotentialUnleashed.tsx`

## `api-health-sentinel`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Strict rule: ok is TRUE only when HTTP status is 2xx. Any 4xx/5xx is recorded with the code and the first 200 chars of the response body.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ model: "text-embedding-3-small", input: "ping" }` / `{ model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }` / `{ model: "sonar", max_tokens: 16, messages: [{ role: "user", content: "hi" }` / `{ subject, body: bodyText, severity, dedupe_key: `api-health:${overallClass }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `CRON_SECRET`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_settings`, `ai_usage_log`, `api_health_checks`, `diagnostic_profiles`, `ef_error_log`, `ef_faults`, `entries`, `evidence_fragments`, `influence_timeline`, `linkedin_connections`, `onboarding_article_log`, `ops_alerts`, `score_snapshots`, `source_registry`, `strategic_signals`, `sync_errors`, `sync_runs`
- **RPCs called:** `admin_cron_failures_24h`, `is_current_user_admin`, `recent_cron_http_failures`
- **Other functions invoked over HTTP:** `admin-notify`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `ask-aura`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Relevance floor. A relative floor, not an absolute one, because the scale of `rank` is not guaranteed: drop any row scoring below 40% of the top row. The top row is never dropped. Applied wherever retrieval is consumed — the pre-generation call and the search_my_graph tool alike. Deliberately NOT a re-rank pass: a per-search model call stays out of scope until operation_runs.cost_usd is populated, because adding uninstrumented model calls while per-turn cost is unmeasurable is the wrong trade.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "LOVABLE_API_KEY not configured" }` / `{ error: "Not authenticated" }` / `{ error: "Invalid session" }` / `{ error: "messages required" }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `aura_conversation_memory`, `authority_voice_profiles`, `desk_learning`, `desk_number_violations`, `diagnostic_profiles`, `document_chunks`, `entries`, `industry_trends`, `linkedin_post_metrics`, `linkedin_posts`, `notification_events`, `post_events`, `product_facts`, `score_snapshots`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `ask-aura-opener`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** This is the system prompt for any model that ever writes an opener, and the specification `applyVoiceContract()` enforces on deterministic text. It sits ON TOP of the six ordered rules (overnight → promise → draft → unwritten signal → quiet radar → cold start). It does not change which rule fires; it constrains what the fired rule is allowed to say.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `aura_conversation_memory`, `diagnostic_profiles`, `entries`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/ask/AskAuraV2.tsx`

## `audit-interpretation`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/audit-interpretation/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ model: "claude-sonnet-4-5-20250929", max_tokens: 4096, system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }` / `{ error: "Rate limited. Please try again shortly." }` / `{ error: "Credits exhausted. Please add funds." }`
- **HTTP statuses returned:** 401, 402, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/AuditResultsView.tsx`

## `aura-card-emails`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Auth: lowercase cron_secret from Vault OR uppercase env fallback OR service role.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: pErr.message }` / `{ mode, considered: profiles?.length ?? 0, sent: results.filter(r => r.state.startsWith("SENT_")).length, results, }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `lifecycle_emails`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `aura-health-audit`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Prefer updated_at if present else created_at. Try updated_at first.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `document_chunks`, `document_jobs`, `documents`, `ef_error_log`, `evidence_fragments`, `evidence_jobs`, `health_findings`, `source_registry`, `strategic_signals`
- **RPCs called:** `email_crons_ran_without_sends`, `is_current_user_admin`
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/admin/HealthFindingsPanel.tsx`

## `aura-ops-report`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** aura-ops-report Daily plain-English operations report emailed to the founder. ALWAYS sends — its arrival IS the outermost heartbeat. Never make sending conditional.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ from: FROM, to: [founderEmail], subject, html: emailHtml, tags: [ { name: "user_id", value: founderUserId }` / `{ ok: true, verdict, subject, dry_run: dryRun, resend_status: resendStatus, resend_error: resendError || null, plain_text: plainText, }`
- **HTTP statuses returned:** 403
- **Secrets / env read:** `ADMIN_ALERT_EMAIL`, `AURA_OPS_REPORT_EMAIL_ENABLED`, `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `content_items`, `ef_error_log`, `entries`, `job_queue`, `known_issues`, `linkedin_posts`
- **RPCs called:** `ops_cron_status`, `ops_health_findings_summary`
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `auras-read`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** THE DICTIONARY (Deno twin of src/constants/vocabulary.ts) — count nouns only from here.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: SYSTEM_PROMPT }` / `{ error: "rate_limit" }` / `{ error: "credits" }`
- **HTTP statuses returned:** 200, 401, 402, 429
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_scores`, `entries`, `industry_trends`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/AurasRead.tsx`, `src/components/home/YourMoves.tsx`

## `auth-resend-confirmation`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Resend the sign-up confirmation link. Honest by design: if the provider rate-limits or errors, we say so — we never report "sent" when nothing was.
- **Input payload:** `{ email, origin }`
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Auth.tsx`

## `auth-signup`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Public sign-up door. Enforces the per-IP account-creation ceiling before an account can exist at all, then creates the account with email verification on.
- **Input payload:** `{ email, password, origin, consent_version }`
- **Output shape (JSON.stringify keys seen):** `{ from: "Aura <invites@aura-intel.org>", to: ["mmahafzah8386@gmail.com"], subject: "Aura — signup ceiling reached", html, }` / `{ from: "Aura <invites@aura-intel.org>", to: [addr], subject: "Welcome to Aura", html, }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `signup_attempts`, `signup_ceiling_alerts`, `signup_refusals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Auth.tsx`, `src/pages/Onboarding.tsx`

## `backfill-brand-pillars`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Auth: CRON_SECRET only. Accept either `x-cron-secret` header or `Authorization: Bearer <CRON_SECRET>`. No other gate, no fallback.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "CRON_SECRET not configured" }` / `{ error: "Unauthorized" }` / `{ error: error.message }` / `{ scanned: candidates.length, updated, skipped, updates, }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `backfill-document-briefs`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** backfill-document-briefs — admin only, never scheduled. Walks completed documents oldest first, one at a time, and builds the brief that document never got. Self-chains until nothing is left.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `document_briefs`, `documents`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `supabase/functions/backfill-document-briefs/index.ts`

## `backfill-document-evidence`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Service-role / cron only. Deletes existing fragments for a document's source_registry and enqueues a fresh evidence_job so the sliced pipeline re-extracts the whole document.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: "document_id required" }` / `{ error: "document not found" }` / `{ success: true, document_id: documentId, source_registry_id: registry.id, evidence_job_id: job.id, total_chunks: totalChunks || 0, old_fragments_deleted: oldIds.length, }`
- **HTTP statuses returned:** 400, 403, 404
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `document_chunks`, `documents`, `evidence_fragments`, `evidence_jobs`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `backfill-embeddings`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** backfill-embeddings — fill missing vectors, one batch at a time. Admin-gated (service role, or a signed-in admin — same gate as send-invite). Always text-embedding-3-small: 8,400 existing vectors live in that space and mixing models makes comparisons meaningless. Body: { table, batch_size? }. Chains itself while rows remain, exactly like ingest-document chains its slices. Idempotent and safely re-runnable.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: EMBED_MODEL, input: inputs }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `OPENAI_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `supabase/functions/backfill-embeddings/index.ts`

## `backfill-fingerprints`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** --- Auth: founder only ---
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `backfill-theme-tags`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/backfill-theme-tags/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ success: true, scanned, updated }` / `{ error: (e as Error).message }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `backfill-unprocessed-entries`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** --- Auth: service-role OR admin user only ---
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: "target_user_id required" }` / `{ processed_this_batch, remaining, batch_n: _batch_n, }` / `{ error: (error as Error).message }`
- **HTTP statuses returned:** 400, 403, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `entries`, `source_registry`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `brand-assessment`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Read the member's own material so the report is written from it, not from answers alone.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Confirm your email first — the link is in your inbox. Then this starts." }` / `{ error: "Your report has already been written. Open it from My Story." }` / `{ queued: true, error: QUEUE_MESSAGE }`
- **HTTP statuses returned:** 200, 401, 402, 403, 409, 429
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `instrument_runs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/BrandAssessmentModal.tsx`, `src/components/ObjectiveAuditModal.tsx`, `src/components/tabs/IdentityTab.tsx`, `src/lib/marketRead.ts`

## `browser-capture`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/browser-capture/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ code: insErr.code, message: insErr.message, postUrl }` / `{ code: insErr.code, message: insErr.message, postId: post.id }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `influence_snapshots`, `linkedin_post_metrics`, `linkedin_posts`, `sync_errors`, `sync_runs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `build-document-brief`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** build-document-brief A grounded, whole-document read. Every claim it keeps carries a verbatim quote from a real chunk and the chunk it came from. Verification happens in code, after the model has spoken — a claim whose quote is not literally present in its chunk is discarded, never repaired and never softened. Shape: MAP over chunk slices of 20 (cursor + self-invoke, same pattern as extract-evidence-slice), then REDUCE once at the end: dedupe by embedding cosine > 0.92, verify every item, write one row per (document_id, version).
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: EMBED_MODEL, input: batch }` / `{ model: MODEL, messages: [ { role: "system", content: systemPrompt }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `document_briefs`, `document_chunks`, `documents`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `supabase/functions/backfill-document-briefs/index.ts`, `supabase/functions/build-document-brief/index.ts`, `supabase/functions/ingest-document/index.ts`

## `calculate-aura-score`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Auth: accept user JWT (browser) OR service-role / cron (server-side callers like detect-signals-v2). Mirrors voice-distill L51–95.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "user_id is required" }` / `{ error: "Unauthorized" }` / `{ error: e instanceof Error ? e.message : "Unknown error" }`
- **HTTP statuses returned:** 200, 400, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `authority_voice_profiles`, `diagnostic_profiles`, `entries`, `evidence_fragments`, `linkedin_post_metrics`, `linkedin_posts`, `score_snapshots`, `source_registry`, `strategic_signals`, `user_milestones`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `supabase/functions/detect-signals-v2/index.ts`, `supabase/functions/run-qa-walkthrough/index.ts`

## `capture-report-snapshot`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Freezes the Strategic Identity Report into a versioned snapshot. SOURCE-OF-TRUTH NOTE: a single shared assembly module across the browser client and Deno is NOT practical here — src/lib/buildIdentityReport.ts imports through the Vite "@/" alias (marketPersonas, postProvenance) and the generated Database types, none of which resolve inside the edge runtime; and edge bundles do not include files outside supabase/functions. So the ReportData shape is mirrored here field for field. Any change to src/lib/buildIdentityReport.ts MUST be mirrored in this file.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `diagnostic_profiles`, `documents`, `entries`, `evidence_fragments`, `imprint_snapshots`, `linkedin_connections`, `linkedin_posts`, `market_mirror_cache`, `mirror_reads`, `report_snapshots`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/identity/ReportVersions.tsx`, `src/lib/reportSnapshot.ts`

## `chat-aura`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** --- Live user context for system prompt injection ---
- **Input payload:** `{ messages, mode, session_id: currentSessionId }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Messages required" }` / `{ error: "Not authenticated" }` / `{ error: "ANTHROPIC_API_KEY not configured" }` / `{ error: "Rate limit exceeded." }`
- **HTTP statuses returned:** 400, 401, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `aura_conversation_memory`, `diagnostic_profiles`, `documents`, `entries`, `learned_intelligence`, `linkedin_posts`, `master_frameworks`, `retrieval_logs`, `score_snapshots`, `skill_targets`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `check-invite-token`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/check-invite-token/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** `check_invite_token`
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AcceptInvitation.tsx`

## `check-lifecycle-triggers`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/check-lifecycle-triggers/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ processed: results.length, results }` / `{ error: e?.message || "Server error" }`
- **HTTP statuses returned:** 200, 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `lifecycle_emails`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `classify-posts`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Fetch posts without topic_label
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ success: false, error: "AI not configured" }` / `{ error: "Unauthorized" }` / `{ success: false, error: fetchErr.message }` / `{ success: true, classified: 0, message: "All posts already classified" }`
- **HTTP statuses returned:** 200, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `cleanup-posts`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Profile pages
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ success: false, error: "Not authenticated" }` / `{ success: true, total: 0, kept: 0, rejected: 0, reasons: { }` / `{ success: true, total: posts.length, kept, rejected, reasons, }` / `{ success: false, error: err.message }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/influence/PostCleanupPanel.tsx`

## `colleague-invite`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Always compute remaining
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ used, remaining, max: MAX_INVITES }` / `{ error: "Please enter a valid email." }` / `{ error: "You've used all 3 invitations." }`
- **HTTP statuses returned:** 400, 401, 403, 409, 500
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `beta_allowlist`, `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/InviteColleagueModal.tsx`

## `completion-invariants-check`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** ============ ASSERTION 1: Stuck publish attempt ============ A real client publish attempt should resolve to published or failed within 1 h. We flag only attempts between 1 h and 48 h old: "stuck" window = 1 h–48 h. Beyond 48 h an unconfirmed attempt is treated as user-abandoned and self-clears.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ ok: findings.length === 0, assertions: summary, findings: findings.map((f) => f.assertion) }` / `{ error: msg }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `documents`, `ef_error_log`, `entries`, `funnel_daily_ratio`, `linkedin_posts`, `signal_engagements`, `source_registry`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `compute-imprint`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/compute-imprint/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: profsErr.message }` / `{ user_id: uid }` / `{ success: true, users_processed, failures }` / `{ error: "user_id is required" }`
- **HTTP statuses returned:** 200, 400, 401, 500, 502
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `eval_metrics`, `facet_states`, `imprint_snapshots`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `compute-imprint`, `calculate-aura-score`
- **Called from:** `src/pages/Dashboard.tsx`, `src/pages/Onboarding.tsx`

## `contact-message`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Honeypot: a person never fills this. Accept and drop.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error }` / `{ ok: true }` / `{ error: "Too many messages. Email support@aura-intel.org and I'll pick it up.", }` / `{ error: "Email is not configured." }`
- **HTTP statuses returned:** 400, 429, 500, 502
- **Secrets / env read:** `IP_HASH_SALT`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `contact_messages`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Contact.tsx`

## `cv-crosscheck`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/cv-crosscheck/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "claude-sonnet-4-5-20250929", max_tokens: 3000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `assessment_sessions`, `diagnostic_profiles`, `document_chunks`, `documents`, `evidence_fragments`, `linkedin_posts`, `linkedin_profile_snapshots`, `mirror_reads`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/cv/CvUploadControl.tsx`, `src/components/tabs/IdentityTab.tsx`

## `daily-briefing`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Validate a URL is a deep article link, not a homepage or 404 */
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Not authenticated" }` / `{ items: [], gaps: [] }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: systemPrompt }` / `{ items: briefingItems.slice(0, 3), gaps: top3Gaps, sector: sectorFocus, generated_at: new Date().toISOString(), }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/IntelligenceCards.tsx`, `src/components/home/MarketScan.tsx`, `src/components/home/TodaysIntelligence.tsx`

## `deduplicate-entries`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Fetch all user entries (active ones)
- **Input payload:** `{ mode }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ groups: [], message: "Not enough entries to deduplicate." }` / `{ error: "Rate limited. Please try again shortly." }` / `{ groups: [], message: "No duplicates found." }`
- **HTTP statuses returned:** 401, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `entries`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/RecentEntries.tsx`

## `delete-account`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Derive the caller identity ONLY from the verified JWT. The request body is never read for targeting — a caller can only delete themselves.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Method not allowed" }` / `{ error: "Unauthorized" }` / `{ error: "We couldn't delete your data. Please try again in a moment." }` / `{ error: "Your data was removed but sign-in couldn't be closed. Please contact support." }`
- **HTTP statuses returned:** 401, 405, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `avatars`
- **RPCs called:** `delete_account`
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Settings.tsx`

## `delete-source`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Resolve user from JWT
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Missing auth" }` / `{ error: "Invalid session" }` / `{ error: "id and kind ('entry'|'document') required" }` / `{ error: "Not found" }`
- **HTTP statuses returned:** 400, 401, 404, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `evidence_fragments`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/SourcesSubTab.tsx`

## `detect-card-style`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/detect-card-style/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ success: false, error: 'post_text is required' }` / `{ success: true, recommendation: buildDefaults(post_text, language) }` / `{ model: 'google/gemini-3-flash-preview', messages: [ { role: 'system', content: SYSTEM_PROMPT }`
- **HTTP statuses returned:** 400, 401, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `detect-market-gaps`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** 1. User's active signals
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ coverage_score: 1, items: [], narrative: "No recent industry trends to analyze in the last 30 days.", }` / `{ user_signals: signals ?? [], industry_trends: trends, }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: systemPrompt }`
- **HTTP statuses returned:** 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `industry_trends`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/IntelligenceTab.tsx`

## `detect-signals-v2`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/detect-signals-v2/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "user_id required" }` / `{ skipped: true, reason: "no fragments to process" }` / `{ skipped: true, reason: "fragments not found" }`
- **HTTP statuses returned:** 400, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `evidence_fragments`, `linkedin_posts`, `signal_topic_preferences`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/IntelligenceTab.tsx`, `src/components/tabs/SourcesSubTab.tsx`, `supabase/functions/extract-evidence-slice/index.ts`, `supabase/functions/extract-evidence/index.ts`, `supabase/functions/ingest-document/index.ts`, `supabase/functions/reap-unsignalled-sources/index.ts`

## `discover-linkedin-posts`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/discover-linkedin-posts/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ success: false, retired: true, error: "Post discovery is retired: it returned search-result snippets, not real posts. Use linkedin-fetch-posts.", }` / `{ success: false, error: "Firecrawl connector not configured" }` / `{ success: false, error: "Unauthorized" }` / `{ success: true, message: "No active connections to process" }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `DISCOVERY_ENABLED`, `FIRECRAWL_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `discovery_review_queue`, `linkedin_connections`, `linkedin_posts`, `sync_runs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `discover-linkedin-posts`, `classify-posts`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `draft-owner-check`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** draft-owner-check — D122. A member clicks "Open your draft" from a lifecycle email while signed into a second account. RLS returns zero rows, and the dashboard used to tell them the draft was gone. That is untrue (law #138). This function answers one narrow question with the service role: does this draft id exist, and is the caller its owner? When it is owned by somebody else we return a MASKED owner email so the viewer can recognise their other account without us leaking an address they do not own.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Dashboard.tsx`

## `draft-post`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/draft-post/index.ts
- **Input payload:** `{ title, summary, content, type, lang }`
- **Output shape (JSON.stringify keys seen):** `{ model: "claude-sonnet-4-5-20250929", max_tokens: 4096, system, messages: [{ role: "user", content: user }` / `{ error: "Unauthorized" }` / `{ error: "Content or summary is required" }` / `{ post: finalPost }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/LinkedInDraftPanel.tsx`, `src/components/RecentEntries.tsx`, `src/components/WeeklyTransformationLens.tsx`, `src/components/tabs/InfluenceTab.tsx`, `src/pages/TrendDetail.tsx`

## `draft-profile-copy`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Draft a headline or About section for a member FROM THEIR OWN WRITING. Auth, CORS and the json() helper mirror linkedin-fetch-profile exactly. The function refuses — without calling the model — when the member has fewer than three posts with text. We never claim to write in a voice we have not read.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: await loadModel(admin), temperature: 0.7, messages: [ { role: "system", content: systemPrompt(target, language, bannedWords) }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_settings`, `authority_voice_profiles`, `ef_error_log`, `linkedin_posts`, `linkedin_profile_snapshots`, `profile_copy_drafts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/identity/DraftProfileCopy.tsx`

## `draft-ready-email`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** draft-ready-email Lifecycle email that names the actual finished draft Aura has written for the user. DRY-RUN BY DEFAULT. When the `dry_run` key is absent from the body, it defaults to true. In dry-run mode we do every lookup, build every email, write log rows prefixed `dryrun:`, but call Resend ZERO times. GUARDED. The run is now safe to schedule: drafts must be 12h–7d old, members with `lifecycle_opt_out` are skipped, admin accounts are skipped, and a draft that already had a `post_ready` email is never emailed again here. This function is therefore a
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: "invalid only_user_id" }` / `{ error: "invalid only_draft_id" }` / `{ error: message }`
- **HTTP statuses returned:** 200, 400, 403, 500
- **Secrets / env read:** `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `content_items`, `diagnostic_profiles`, `ef_error_log`, `evidence_fragments`, `lifecycle_email_log`, `lifecycle_emails`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `ef-boot-check`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Does every Edge Function still start? A named import of an export that does not exist is a LINK-TIME error in Deno: the isolate never boots, the gateway answers 503 with no CORS headers, and the member simply sees "failed to send a request". Nothing in the app notices, because no code inside the function ever runs. Six functions were dark for four weeks that way. So once a day we knock on every door. An OPTIONS request that gets ANY HTTP response proves the isolate booted. No response, or a 503, is the finding.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_error_log`, `health_findings`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `evaluate-content-quality`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Stable cache key: the same text judged against the same terms is never re-judged. */
- **Input payload:** `{ post_text, language, signal_title, voice_tone, user_sector, target_register, grounding_text, content_kind, expected_ending, signal_id, }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "post_text required" }` / `{ pass: false, score: 0, skipped: true, skip_reason: "missing_api_key", judge_model: JUDGE_MODEL, }` / `{ ...(cached.verdict as any), content_hash: cacheKey, cached: true }`
- **HTTP statuses returned:** 400, 401
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `content_gate_cache`, `evidence_fragments`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/studio/AdvisorCard.tsx`, `supabase/functions/generate-authority-content/index.ts`

## `export-my-data`

- **JWT verification:** true
- **Purpose (verbatim from the file header):** User-content tables only. Internal/telemetry tables (ef_error_log, job_queue, sync_*, product_events, output_leak_log, ai_usage_log, *_retired_*) are operations data and are deliberately excluded.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "We could not build your export file. Please try again in a few minutes.", detail: e instanceof Error ? e.message : String(e), }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `extract-evidence`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** The gateway intermittently ignores response_format:json_object and returns a top-level ARRAY wrapping the object. Normalise the shape once, here.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Forbidden" }` / `{ error: "source_registry_id or (source_type, source_id, user_id) required" }` / `{ success: true, source_registry_id: registryId, evidence_job_id: jobId, pipeline: "sliced", }`
- **HTTP statuses returned:** 400, 401, 403, 500
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `document_chunks`, `documents`, `entries`, `evidence_fragments`, `evidence_jobs`, `learned_intelligence`, `master_frameworks`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/SourcesSubTab.tsx`, `supabase/functions/backfill-unprocessed-entries/index.ts`, `supabase/functions/ingest-capture/index.ts`, `supabase/functions/night-agent-hunt/index.ts`, `supabase/functions/reap-unprocessed-captures/index.ts`

## `extract-evidence-slice`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/extract-evidence-slice/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: "evidence_job_id required" }` / `{ skipped: true, status: job.status }` / `{ success: true, phase: "reduced" }`
- **HTTP statuses returned:** 400, 403
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `document_chunks`, `documents`, `evidence_fragments`, `evidence_jobs`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `supabase/functions/backfill-document-evidence/index.ts`, `supabase/functions/extract-evidence-slice/index.ts`, `supabase/functions/extract-evidence/index.ts`

## `fetch-industry-trends`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Trusted publisher domains
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: systemPrompt }` / `{ model: "sonar", messages: [{ role: "user", content: `Find 5 recent articles, reports, or whitepapers about: ${q }` / `{ url, formats: ["markdown"], onlyMainContent: true }` / `{ phase: "enrich", user_id: userId, candidate_ids: candidateIds, mode }`
- **HTTP statuses returned:** 200, 202, 400, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `industry_trends`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `fetch-industry-trends`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `founder-daily-brief`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** founder-daily-brief — the single daily heartbeat email. Computes the whole founder picture once, stores it as one row, renders it, sends it. Always sends. Every headline number is computed twice.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ADMIN_ALERT_EMAIL`, `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `daily_brief_snapshots`, `ef_error_log`
- **RPCs called:** `decisions_due`, `founder_brief_data`, `founder_brief_user_ids`, `is_current_user_admin`, `record_brief_run`
- **Other functions invoked over HTTP:** none
- **Called from:** `src/lib/adminMetrics.ts`, `src/pages/Admin.tsx`

## `generate-action-output`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/generate-action-output/index.ts
- **Input payload:** `{ action, rationale, output_type }`
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: system }` / `{ error: "Unauthorized" }` / `{ error: "action and output_type required" }` / `{ error: `Unknown output_type: ${output_type }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/ActionWorkspace.tsx`

## `generate-authority-content`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** The member's own distribution, and the ceilings a draft is held to.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized: user_id required for service/cron call" }` / `{ error: "run_id required" }` / `{ error: "not_found" }` / `{ error: "forbidden" }`
- **HTTP statuses returned:** 200, 400, 401, 402, 403, 404, 429, 500, 502
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `CRON_SECRET`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `content_gate_results`, `content_items`, `diagnostic_profiles`, `ef_error_log`, `evidence_fragments`, `learned_intelligence`, `narrative_suggestions`, `operation_runs`, `output_leak_log`, `strategic_signals`, `voice_distribution`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `generate-brand-positioning`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Fallback: build profileContext from the user's diagnostic profile if not provided
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ success: true, skipped: true, reason: "no_profile" }` / `{ positioning }` / `{ error: e instanceof Error ? e.message : "Unknown error" }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `generate-branded-post`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/generate-branded-post/index.ts
- **Input payload:** `{ news_item }`
- **Output shape (JSON.stringify keys seen):** `{ error: "news_item required" }` / `{ error: "Not authenticated" }` / `{ error: "Rate limit exceeded" }` / `{ error: "AI credits exhausted" }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `linkedin_connections`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/IntelligenceCards.tsx`, `src/components/tabs/MarketTab.tsx`

## `generate-deck`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** generate-deck — the writer stage of the carousel pipeline. Six stages. The model NEVER emits layout: it emits a judgement (stage 2) and content into named slots (stage 4). Stages 1, 3, 5 and 6 contain no model call. A malformed model response is rejected at the tool-call layer.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ fragments: evidence.length, raw_captures: raw.length, voice_profiles: (voices ?? []).map((v: any) => `${v.language }`
- **HTTP statuses returned:** 204
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `deck_events`, `diagnostic_profiles`, `entries`, `evidence_fragments`, `linkedin_connections`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/studio/StudioPanel.tsx`

## `generate-edition`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** -------- JSON repair --------
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "not_enough_signals", found: signals.length }` / `{ model: "claude-sonnet-4-5-20250929", max_tokens: 12000, system: systemPrompt, messages: [{ role: "user", content: userMessage }` / `{ error: "Aura is busy — try again in a moment." }`
- **HTTP statuses returned:** 200, 401, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `diagnostic_profiles`, `entries`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/EditionStudio.tsx`

## `generate-framework-diagram`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** ── Archetype definitions ──
- **Input payload:** `{ framework_id, diagram_description, framework_title, mode, exclude_archetype, exclude_style }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Forbidden" }` / `{ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: archetypeSelectionPrompt }` / `{ model: "google/gemini-3.1-flash-image-preview", messages: [{ role: "user", content: imagePrompt }`
- **HTTP statuses returned:** 401, 402, 403, 429, 500
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `linkedin_connections`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/FrameworkBuilderInline.tsx`, `src/components/MyFrameworks.tsx`

## `generate-identity-intelligence`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Gather existing user data
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ identity: identityModel }` / `{ error: e.message }`
- **HTTP statuses returned:** 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `evidence_fragments`, `learned_intelligence`, `master_frameworks`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/IdentityTab.tsx`

## `generate-impact-narrative`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** GROUNDING: pull canonical imprint + components from imprint_snapshots so narrative + cache key cannot drift from the dial.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Failed to generate narrative" }` / `{ error: e instanceof Error ? e.message : "Unknown error" }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `impact_narratives`, `imprint_snapshots`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/ImpactTab.tsx`

## `generate-market-mirror`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Rate limit: once per 7 days
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "rate_limited", retry_in_days: Math.ceil((7 * 24 * 60 * 60 * 1000 - ageMs) / (24 * 60 * 60 * 1000)) }` / `{ model: "sonar", messages: [{ role: "user", content: `What have McKinsey, PwC, BCG, Deloitte, and EY published about ${p.sector_focus }` / `{ error: "ai_failed", status: aiRes.status }`
- **HTTP statuses returned:** 200, 401, 429, 500, 502
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `beta_allowlist`, `diagnostic_profiles`, `industry_trends`, `linkedin_posts`, `market_mirror_cache`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/MarketMirror.tsx`, `src/components/tabs/IdentityTab.tsx`

## `generate-onepager`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/generate-onepager/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "type must be 'explainer' or 'qa'" }` / `{ error: "topic is required" }` / `{ model: "claude-sonnet-4-5-20250929", max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: userMessage + captionSpec }`
- **HTTP statuses returned:** 400, 401, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `diagnostic_profiles`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `generate-schematic-spec`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/generate-schematic-spec/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ success: false, error: 'post_text is required' }` / `{ success: false, error: 'LOVABLE_API_KEY not configured' }` / `{ model: 'google/gemini-3-flash-preview', messages: [ { role: 'system', content: SYSTEM_PROMPT }`
- **HTTP statuses returned:** 200, 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/visual-cards/SchematicPreviewPanel.tsx`

## `generate-silence-alarm`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Resolve target user(s)
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ users: userIds.length, results }` / `{ error: (e as Error).message }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `industry_trends`, `notification_events`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/SilenceAlarm.tsx`

## `ghost-draft-writer`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Sleeping Agent Phase 5 — ghost draft writer. The night AFTER a user keeps an overnight finding, draft ONE LinkedIn post in their voice by reusing generate-authority-content, and save it as a linkedin_posts draft. Never publishes. Fail-silent per user.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "load_failed" }` / `{ action: "generate_content", user_id: userId, content_type: "linkedin_post", topic, context, language, stream: false, }` / `{ ok: true, summary }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `diagnostic_profiles`, `entries`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `generate-authority-content`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `home-address`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** home-address — THE CHIEF OF STAFF BRAIN Three phases, in order: A. Facts   — SQL only. Every number Aura says out loud is computed here. B. Decide  — lens + ranked moves, deterministic code. No model. C. Address — the model writes prose from the facts. It never sees the DB and never produces a number. A post-generation guard rejects any integer that is not present in the facts object. Idempotent per (user_id, address_date) unless { force: true }.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: MODEL, messages: [ { role: "system", content: SYSTEM_PROMPT }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `content_items`, `diagnostic_profiles`, `entries`, `evidence_fragments`, `facet_states`, `home_address`, `imprint_snapshots`, `linkedin_connections`, `linkedin_posts`, `source_registry`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/hooks/useHomeAddress.ts`

## `import-linkedin-export`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Import the member's official LinkedIn data export (Shares.csv). Analytics sync gives us metrics and URLs but never the post commentary — the scope that returns text is restricted. The member's own data export is the only complete source of their history, so this endpoint takes the rows the browser parsed out of Shares.csv and fills in the text we are missing. Matching order per row: exact URL, then the numeric activity id, then the same publication day plus overlapping slug words. Never creates duplicates.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/LinkedInImport.tsx`

## `ingest-capture`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Proper noun corrections for known domains
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Missing authorization" }` / `{ error: "Unauthorized" }` / `{ error: "type and content are required" }` / `{ error: "duplicate_url", processing_status: "duplicate", message: `You already captured this URL on ${new Date(existing[0].created_at).toLocaleDateString() }`
- **HTTP statuses returned:** 200, 201, 400, 401, 500
- **Secrets / env read:** `OPENAI_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `captures`, `entries`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `ingest-source-event`
- **Called from:** `src/pages/AdminAccess.tsx`

## `ingest-document`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** NOTE: PROCESS_DEADLINE_MS / PDF_EXTRACT_DEADLINE_MS removed — the staged cursor+heartbeat pattern (document_jobs) replaces them.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "text-embedding-3-small", input: batch.map((r) => r.content) }` / `{ error: "Forbidden" }` / `{ success: true, worker: true }` / `{ error: "document_id or document_job_id required" }`
- **HTTP statuses returned:** 400, 401, 403, 404, 500
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `document_chunks`, `document_jobs`, `documents`, `ef_error_log`, `entries`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/cv/CvUploadControl.tsx`, `src/components/tabs/SourcesSubTab.tsx`, `supabase/functions/ingest-document/index.ts`, `supabase/functions/reap-stuck-documents/index.ts`

## `ingest-source-event`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/ingest-source-event/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `source_events`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `integrate-facets`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/integrate-facets/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ user_id: uid }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `diagnostic_profiles`, `evidence_fragments`, `facet_states`, `influence_snapshots`, `linkedin_posts`, `notifications`, `source_events`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `integrate-facets`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `job-worker-voice-distill`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** One claim per invocation. Do not loop.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ claimed: false, error: `claim_failed: ${claimErr.message }` / `{ claimed: false }` / `{ user_id: userId }`
- **HTTP statuses returned:** 200, 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** `claim_job`, `complete_job`
- **Other functions invoked over HTTP:** `voice-distill`
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `knowledge-intelligence`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Verify user
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "AI service not configured" }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: "You are a strategic intelligence analyst. Use the provided tool to return structured data." }` / `{ error: "Rate limit exceeded. Try again shortly." }`
- **HTTP statuses returned:** 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `documents`, `entries`, `evidence_fragments`, `influence_snapshots`, `learned_intelligence`, `linkedin_posts`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/KnowledgeIntelligenceEngine.tsx`

## `learn-from-sessions`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** learn-from-sessions — the Desk learns from WORKING with him, nothing else. THE DISCIPLINE (Q2). This function is the easiest place in the product for confident invention to return dressed as insight, so it is deliberately dumb: - Every observation is a COUNT with the evidence ids behind it. Never an adjective, never a motive, never a mood, never a personality reading. - Minimum three occurrences before a row is written at all; five or more makes it `strong`. - Only five kinds may ever be learned: asks_about, acts_on, rejects,
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `aura_conversation_memory`, `desk_answer_feedback`, `desk_learning`, `diagnostic_profiles`, `product_events`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `lifecycle-emails`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** THE DICTIONARY (Deno twin of src/constants/vocabulary.ts) — count nouns only from here.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ from: "Aura <Mohammad.Mahafdhah@aura-intel.org>", to: [to], subject, reply_to: "mohammad.mahafdhah@aura-intel.org", html, tags, }` / `{ error: "Forbidden" }` / `{ error: "Email service not configured" }` / `{ processed: results.length, results, founderDigest: founderDigest.length }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `lifecycle_email_log`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `linkedin-claim`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Hash the caller-supplied claim_token and require it to match the row's stored hash. This prevents any authenticated user from hijacking a pending connection by guessing/leaking only its row id.
- **Input payload:** `{ temp_id, claim_token }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Missing temp_id or claim_token" }` / `{ error: "Invalid claim" }` / `{ error: "Failed to claim connection" }`
- **HTTP statuses returned:** 400, 401, 403, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `linkedin-expert-advisor`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Authenticate
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Rate limited. Try again shortly." }` / `{ error: "AI credits exhausted." }` / `{ error: "AI analysis failed" }`
- **HTTP statuses returned:** 401, 402, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `documents`, `entries`, `influence_snapshots`, `learned_intelligence`, `linkedin_posts`, `master_frameworks`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/LinkedInExpertAdvisor.tsx`

## `linkedin-fetch-posts`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Fetch a member's LinkedIn posts via Apify and ingest their OWN written posts. Runs for the calling user. The founder may pass { user_id } to run it for someone else (admin/testing); everyone else is silently forced to self.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ targetUrls: [canonical_url], maxPosts: max_posts, scrapeReactions: false, scrapeComments: false, }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `APIFY_TOKEN`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/LinkedInImportCard.tsx`, `src/components/identity/HowYouAppear.tsx`, `src/components/settings/LinkedInAddressCard.tsx`, `src/components/voice/TeachAura.tsx`, `src/pages/Onboarding.tsx`

## `linkedin-fetch-profile`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Fetch a member's FULL LinkedIn profile via Apify and snapshot it. Companion to linkedin-fetch-posts: same auth shape, same URL rules, same Apify call style. Appends ONE NEW dated snapshot row per read — the history is append-only, and a short scrape can never shrink a member's record because every list field is merged with the previous snapshot. Fills in profile fields the member has not set themselves — never over one they have.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `APIFY_TOKEN`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `linkedin_connections`, `linkedin_profile_snapshots`, `profile_copy_drafts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/identity/HowYouAppear.tsx`, `src/components/settings/LinkedInAddressCard.tsx`, `src/components/voice/TeachAura.tsx`, `src/pages/Onboarding.tsx`

## `linkedin-identity-backfill`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** The address comes from the token, never from the name. For every active connection with a live token this reads the member's own LinkedIn identity with the member's own access token, and writes the handle, the profile URL and the profile name from that response only. Nothing here derives an address from a display name; a member with no public identifier is recorded as confirmed by identity, not decorated with a plausible guess. It also establishes, once, whether Aura may post for the member. The probe reserves an image upload slot — a real exercise of w_member_social that
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ initializeUploadRequest: { owner: author }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `linkedin-metrics-sync`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** linkedin-metrics-sync — daily LinkedIn analytics engine → influence_snapshots
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `influence_snapshots`, `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/ImpactTab.tsx`

## `linkedin-oauth`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Build redirect_uri based on the calling app's origin
- **Input payload:** `{ action, origin }`
- **Output shape (JSON.stringify keys seen):** `{ error: "LINKEDIN_CLIENT_ID not configured" }` / `{ url: authUrl }` / `{ connected: false }` / `{ error: "Unauthorized" }`
- **HTTP statuses returned:** 400, 401, 500
- **Secrets / env read:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_error_log`, `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/LinkedInConnector.tsx`, `src/components/LinkedInIntelligence.tsx`, `src/components/tabs/ImpactTab.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Onboarding.tsx`, `src/pages/Settings.tsx`

## `linkedin-oauth-callback`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Authenticate the calling user
- **Input payload:** `{ code, redirect_uri }`
- **Output shape (JSON.stringify keys seen):** `{ error: "LinkedIn credentials not configured" }` / `{ error: "Unauthorized" }` / `{ error: "Missing authorization code" }` / `{ error: "Missing redirect_uri" }`
- **HTTP statuses returned:** 400, 401, 500
- **Secrets / env read:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`, `linkedin_profile_snapshots`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/LinkedInCallback.tsx`

## `linkedin-post-metrics-sync`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** linkedin-post-metrics-sync — daily per-post LinkedIn analytics for Aura-published posts.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`, `linkedin_post_metrics`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `linkedin-publish`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** linkedin-publish — redeploy 2026-06-25 (image upload support)
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ post_id: (post as any)?.id, correlation_id: correlationId, }` / `{ initializeUploadRequest: { owner: `urn:li:person:${connection.linkedin_id }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `content_gate_results`, `draft_edits`, `ef_error_log`, `job_queue`, `linkedin_connections`, `linkedin_posts`, `strategic_signals`, `training_logs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/AuraCardPanel.tsx`, `src/components/FlashPanel.tsx`, `src/components/signature/Publish.tsx`, `src/components/studio/StudioPanel.tsx`

## `linkedin-share-read`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Posts the member's reveal card to their own LinkedIn feed. Posting permission is unproven for this app, so a refusal is an expected outcome (200 + reason), never a server fault.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ initializeUploadRequest: { owner: author }` / `{ author, commentary: caption, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }`
- **HTTP statuses returned:** 426
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_settings`, `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `linkedin-sync`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** userinfo does not carry vanityName; /v2/me does, and the handle is what the studio renders under the member's name.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ success: true, note: "No active connections to sync" }` / `{ success: true, scheduled: true, synced: results.length, results }` / `{ error: "Unauthorized" }` / `{ error: err.message }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `influence_snapshots`, `linkedin_connections`, `linkedin_posts`, `sync_errors`, `sync_runs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/LinkedInConnector.tsx`

## `linkedin-token-refresh`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** linkedin-token-refresh — daily scheduled refresh
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `log-client-error`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Validate + clamp inputs
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ ok: true }`
- **HTTP statuses returned:** 200
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/lib/clientErrorLog.ts`

## `mark-user-active`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/mark-user-active/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ ok: true, updated: false, reason: "no_email" }` / `{ ok: true, updated: false, reason: "not_on_allowlist" }` / `{ ok: true, updated: false, status: "active" }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `beta_allowlist`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Dashboard.tsx`

## `market-intelligence`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Fetch user's diagnostic profile for context
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Not authenticated" }` / `{ error: "Perplexity connector not configured" }` / `{ error: "Perplexity credits exhausted" }` / `{ items, citations }`
- **HTTP statuses returned:** 401, 402, 500
- **Secrets / env read:** `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/MarketTab.tsx`

## `mcp`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** AUTO-GENERATED by @lovable.dev/mcp-js — do not edit. Regenerated by the Vite plugin. To take ownership, delete this banner line; the plugin then leaves the file alone. supabase function: mcp Bundled from src/lib/mcp/index.ts by @lovable.dev/mcp-js. src/lib/mcp/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** none
- **Tables touched:** `entries`, `evidence_fragments`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `mirror-read`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** MIRROR — the public read engine. Serves strangers with no account: no Authorization header, no user row, no snapshot write. It reads a public LinkedIn profile plus recent posts through Apify, asks one model for a plain-English read, and caches it by handle.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ targetUrls: [canonical_url], maxPosts: MAX_POSTS, scrapeReactions: false, scrapeComments: false, }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `documents`, `linkedin_profile_snapshots`, `mirror_reads`, `mirror_requests`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `night-agent-hunt`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Sleeping Agent Phase 1 — nightly one-article hunt per eligible user. Backend only. Never surfaces errors to users; per-user failures are logged into agent_findings.status='error' and the run continues.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ model: "sonar", messages: [ { role: "system", content: system }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: system }` / `{ error: "Unauthorized" }` / `{ error: "Missing PERPLEXITY_API_KEY or LOVABLE_API_KEY" }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `diagnostic_profiles`, `entries`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `onboarding-find-article`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Curated evergreen fallbacks — build-time validated (HTTP 200). These MUST never be modified without re-validating.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "sonar", messages: [ { role: "system", content: prompt }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `assessment_sessions`, `onboarding_article_log`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Onboarding.tsx`

## `onboarding-linkedin-prefill`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Canonical sector list — must stay in sync with src/constants/sectors.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", response_format: { type: "json_object" }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `onboarding-proposals`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Three spaces the member could own — proposed from their own posts and the claims they saved during the journey. The member keeps one; the two they drop are recorded, because a rejection is a signal too.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `assessment_sessions`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `onboarding-read-link`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** onboarding-read-link — the anonymous capture payoff. A stranger with no account pastes a link. We read the page, pull three to five real fragments out of it, and hand them straight back so the member sees what Aura found in their own link. The fragments are also written into the anonymous session state so a reload does not lose them; the link itself is still replayed into `ingest-capture` at hand-off, which is what creates the durable `evidence_fragments` rows against the account. Public (verify_jwt = false). The assessment session token is the only key.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `assessment_sessions`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `open-document`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Redirects to a fresh short-lived signed URL for a document. Using an edge-function URL avoids ad-blocker rules that target *.supabase.co/storage paths.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ ok: false, error: message, stage }` / `{ ok: true, signedUrl: signed.signedUrl, filename: doc.filename }`
- **HTTP statuses returned:** 200, 302
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `documents`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/tabs/SourcesSubTab.tsx`

## `prepare-weekly-drafts`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** ISO week: e.g. 2026-W23
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ deferred: true, pending: pendingN, attempt }` / `{ users_processed: usersProcessed, drafts_created: draftsCreated, skipped, week: weekTag, }` / `{ error: (e as Error).message }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `content_items`, `diagnostic_profiles`, `ef_error_log`, `job_queue`, `linkedin_posts`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** `generate-authority-content`
- **Called from:** `src/components/home/WeekReadyCard.tsx`

## `publish-invariants-check`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/publish-invariants-check/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: error.message }` / `{ ok: !anyViolation, checks: data }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** `publish_invariants`
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `qa-account`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** A 16-character password from the platform CSPRNG. Never logged, anywhere. */
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Method not allowed" }` / `{ error: "Unauthorized" }` / `{ error: "Forbidden" }` / `{ error: createErr?.message || "Could not create the account" }`
- **HTTP statuses returned:** 401, 403, 405, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_action_log`, `beta_allowlist`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminQA.tsx`

## `qa-ai-evaluate`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/qa-ai-evaluate/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `qa_audit_results`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminQA.tsx`

## `qa-sentinel`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** qa-sentinel — daily outcome assertions over the live platform. Every check asserts an OUTCOME (something a user would notice), never a dependency. Each check can genuinely pass AND fail on real data. One qa_runs row is written per check per run.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_faults`, `linkedin_posts`, `qa_runs`
- **RPCs called:** `founding_seats`, `is_current_user_admin`, `qa_cron_success_jobs`
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `reap-stuck-documents`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Reap by CURRENT ATTEMPT age (processing_started_at), not upload age. Fall back to created_at only for legacy rows where processing_started_at is null.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: findErr.message }` / `{ reaped, evidence_jobs_reaped: reapedJobs, document_jobs_resumed: docJobsResumed, document_jobs_failed: docJobsFailed, }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `document_jobs`, `documents`, `evidence_jobs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `reap-stuck-jobs`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** The reaper runs every 5 minutes; look back one window (plus slack) for newly dead jobs.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }`
- **HTTP statuses returned:** 403
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_error_log`, `job_queue`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `reap-stuck-publishes`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Find publishes that claimed the row > 3 minutes ago and never confirmed.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: findErr.message }` / `{ reaped }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_error_log`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `reap-unprocessed-captures`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Ask Postgres for the actually-stuck entries via anti-join on source_registry. Avoids the fetch-oldest-100-then-filter bug that missed recent stuck captures.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: rpcErr.message }` / `{ scanned: 0, reprocessed: 0 }` / `{ scanned: stuck.length, reprocessed }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `entries`
- **RPCs called:** `pending_capture_entries`
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `reap-unsignalled-sources`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Asserts the OUTCOME (a signal run completed) rather than the dependency (a source_registry row exists). reap-unprocessed-captures covers the layer below this one; both are needed.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: error.message }` / `{ scanned: candidates.length, reinvoked }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `evidence_fragments`, `source_registry`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `record-lineage`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** record-lineage — the human route's lineage writer. `prepare-weekly-drafts` writes lineage inline because it creates the row itself. The composer creates its row from the browser, where the shared Deno helper cannot be imported, so this function exists: the member's own JWT, the row id they just created, and the contributions the generator handed back. Ownership of the row is checked before anything is written. Never throws at the caller: a lineage failure must not cost a draft.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `refresh-voice-profile`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Retrain the member's voice profile from the posts they actually wrote. Runs after any successful import, on demand from the studio, and weekly on a cron for every member with an active LinkedIn connection.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `regenerate-schematic`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/regenerate-schematic/index.ts
- **Input payload:** `{ image_prompt, style_index }`
- **Output shape (JSON.stringify keys seen):** `{ error: "image_prompt required" }` / `{ error: "Not authenticated" }` / `{ model: "google/gemini-3.1-flash-image-preview", messages: [{ role: "user", content: fullPrompt }` / `{ error: "Rate limit exceeded" }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/IntelligenceCards.tsx`, `src/components/LinkedInDraftPanel.tsx`

## `report-invariants-check`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/report-invariants-check/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ error: error.message }` / `{ ok: violated.length === 0, checks: data }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_error_log`
- **RPCs called:** `report_invariants`
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `report-issue`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** report-issue — the single path every member-facing reporting surface uses. Service role, verify_jwt = false: a crash can happen with no valid session, and a report that cannot be filed is the same as no report at all.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `member_issue_reports`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/lib/reportIssue.ts`

## `resend-webhook`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Svix signature scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}`.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `RESEND_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `ef_error_log`, `product_events`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `run-qa-audit`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/run-qa-audit/index.ts
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ healthCheck: true }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `design_system`, `entries`, `industry_trends`, `qa_audit_results`, `score_snapshots`, `strategic_signals`, `user_milestones`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminQA.tsx`

## `run-qa-walkthrough`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** The walkthrough runs against the admin who called it, unless one is named.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Not authenticated" }` / `{ error: "Forbidden" }` / `{ ok: true, report_id: report?.id ?? null, total: results.length, passed, failed, results, insert_error: insertErr?.message ?? null, }`
- **HTTP statuses returned:** 401, 403
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `aura_conversation_memory`, `authority_voice_profiles`, `design_system`, `diagnostic_profiles`, `entries`, `industry_trends`, `linkedin_posts`, `page_backgrounds`, `qa_reports`, `score_snapshots`, `strategic_signals`, `user_milestones`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminQA.tsx`

## `send-account-notification`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Require a valid JWT and ensure caller owns the target email.
- **Input payload:** `{ type, email, first_name }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "type and email required" }` / `{ error: "Forbidden" }` / `{ error: "Unknown notification type" }`
- **HTTP statuses returned:** 400, 401, 403, 500
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/PasswordGate.tsx`, `src/pages/Auth.tsx`, `src/pages/Onboarding.tsx`

## `send-decline-email`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Admin-only guard
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "RESEND_API_KEY missing" }` / `{ error: "Unauthorized" }` / `{ error: "Forbidden" }` / `{ error: "valid email required" }`
- **HTTP statuses returned:** 200, 400, 401, 403, 500
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminAccess.tsx`

## `send-invite`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Where Supabase sends the user AFTER it verifies the invite token: straight into The Collection. Onboarding redirects to auth itself if no session yet.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Method not allowed" }` / `{ error: "Unauthorized" }` / `{ error: "Email service not configured" }` / `{ error: "Forbidden" }`
- **HTTP statuses returned:** 200, 400, 401, 403, 405, 500
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `admin_action_log`, `beta_allowlist`, `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/AdminAccess.tsx`

## `send-lifecycle-email`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** THE DICTIONARY (Deno twin of src/constants/vocabulary.ts) — count nouns only from here.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "user_id and email_type required" }` / `{ error: "Forbidden" }` / `{ error: "invalid email_type" }` / `{ error: "RESEND_API_KEY missing" }`
- **HTTP statuses returned:** 200, 400, 403, 404, 500
- **Secrets / env read:** `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `industry_trends`, `lifecycle_emails`, `linkedin_post_metrics`, `score_snapshots`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/AuraCardPanel.tsx`, `supabase/functions/aura-card-emails/index.ts`, `supabase/functions/check-lifecycle-triggers/index.ts`

## `send-mirror-read`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** SEND-MIRROR-READ — posts an existing Mirror read to an inbox. It never generates. The read is built by `mirror-read` and nowhere else; this function only reads `mirror_reads` and hands it to Resend.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `mirror_reads`, `mirror_requests`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `send-morning-signal`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** send-morning-signal — THE ENVELOPE Sends one email per user per day, only when The Overnight actually produced something. A quiet night sends nothing. Idempotency contract lives in lifecycle_email_log with message_key = 'morning_signal:<YYYY-MM-DD Riyadh>'. dry_run defaults to TRUE. Resend is called ZERO times in dry-run, and no idempotency/lifecycle rows are written.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ ok: true, dry_run: dryRun, message_key: messageKey, candidates: userIds.length, sent, skipped_already: skippedAlready, failed, results, }` / `{ error: msg }`
- **HTTP statuses returned:** 200, 403, 500
- **Secrets / env read:** `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `agent_findings`, `diagnostic_profiles`, `ef_error_log`, `lifecycle_email_log`, `lifecycle_emails`, `notification_events`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `send-password-reset`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Basic validation: length + RFC-ish email regex to reduce abuse surface.
- **Input payload:** `{ email, origin }`
- **Output shape (JSON.stringify keys seen):** `{ error: "email is required" }` / `{ error: "Invalid email" }` / `{ success: true }` / `{ error: "Email delivery failed" }`
- **HTTP statuses returned:** 400, 500
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Auth.tsx`

## `send-read-email`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** send-read-email Emails the member the read they just finished, so it exists somewhere other than a browser tab. Called once, at the end of onboarding, by the member.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `lifecycle_email_log`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Onboarding.tsx`

## `send-resume-email`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** send-resume-email One quiet nudge, once, when a member chooses "Finish later" part-way through the journey. Never a sequence — the caller records that it has been sent.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ from: FROM, to: [user.email], subject: "Pick up where you left off", html }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/Onboarding.tsx`

## `send-weekly-brief`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/send-weekly-brief/index.ts
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "RESEND_API_KEY not configured" }` / `{ success: true, sent_count: sentCount, attempted: userIds.length, errors }` / `{ error: msg }`
- **HTTP statuses returned:** 200, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `content_items`, `diagnostic_profiles`, `entries`, `industry_trends`, `lifecycle_email_log`, `linkedin_posts`, `notification_events`, `score_snapshots`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `signal-decay-engine`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Allow service-role callers (cron/lifecycle) OR authenticated users.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "user_id required" }` / `{ users: userIds.length, processed: totalProcessed, ...totalCounts, }` / `{ error: (e as Error).message }`
- **HTTP statuses returned:** 400, 401, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `evidence_fragments`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `signature-suggest`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Signature Studio — suggestion brain. Auth: user JWT (never trust a client-passed userId). Reads (via service role): diagnostic_profiles, top strategic_signals, authority_voice_profiles, recent linkedin_posts. Calls Lovable AI Gateway with google/gemini-3-flash-preview. On any failure returns { suggestions: [] } with 200 so the client gracefully falls back to its existing defaults.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: designSystem }` / `{ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: capSystem }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: system }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `diagnostic_profiles`, `linkedin_posts`, `signature_events`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/signature/Editor.tsx`, `src/components/signature/Publish.tsx`, `src/components/signature/useSuggestions.ts`

## `sovereign-reading-list`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Fetch user's diagnostic profile for skill context
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Not authenticated" }` / `{ recommendations: [] }` / `{ model: "sonar", messages: [{ role: "user", content: `Find 5 recent executive-level articles, whitepapers, or reports about ${gapNames }` / `{ skill_gaps: skillGaps, recommendations, source: "perplexity+claude", boosts, }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/intelligence/RecommendedReadingSection.tsx`, `src/components/signals/ReadingStrip.tsx`, `src/components/tabs/IntelligenceTab.tsx`

## `strategic-advisor`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Gather intelligence from all layers
- **Input payload:** `{ context }`
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: systemPrompt }` / `{ error: "Rate limited, please try again shortly." }` / `{ error: "AI credits exhausted. Please add funds." }` / `{ error: e instanceof Error ? e.message : "Unknown error" }`
- **HTTP statuses returned:** 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `framework_activations`, `influence_snapshots`, `learned_intelligence`, `master_frameworks`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `strategic-briefing`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Fetch recent data in parallel
- **Input payload:** `{ user_id }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Not authenticated" }` / `{ error: "user_id required" }` / `{ error: "Forbidden" }` / `{ briefing: null, message: "Not enough data for a briefing yet" }`
- **HTTP statuses returned:** 400, 401, 402, 403, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `evidence_fragments`, `master_frameworks`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `strategic-critique`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Gather intelligence from all layers
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ critique: null, reason: "Insufficient data for strategic critique" }` / `{ error: "Rate limited, please try again shortly." }` / `{ error: "AI credits exhausted. Please add funds." }` / `{ critique }`
- **HTTP statuses returned:** 402, 429, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `framework_activations`, `influence_snapshots`, `learned_intelligence`, `master_frameworks`, `notifications`, `strategic_signals`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `strategic-nudge`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Fetch profile for skill gaps
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Not authenticated" }` / `{ nudge: null, reason: "No diagnostic profile" }` / `{ nudge: null, reason: "Active within 48h" }` / `{ nudge: { title: nudgeTitle, body: nudgeBody }`
- **HTTP statuses returned:** 401, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `notifications`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `submit-waitlist`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Simple in-memory IP rate limiter (per isolate). 60 minute window.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Method not allowed" }` / `{ error: "Too many requests. Please try again later." }` / `{ error: "Name is required" }` / `{ error: "Valid email is required" }`
- **HTTP statuses returned:** 200, 400, 405, 429, 500
- **Secrets / env read:** `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `beta_allowlist`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/RequestAccess.tsx`

## `summarize-link`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** SSRF guard: block hostnames pointing at internal/private/link-local ranges, loopback, or cloud metadata endpoints. Matches the policy used by ingest-capture.
- **Input payload:** `{ url }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "URL is required" }` / `{ error: "Invalid URL" }` / `{ error: "Only https:// URLs are allowed" }`
- **HTTP statuses returned:** 400, 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `supabase/functions/ingest-capture/index.ts`

## `sync-own-posts`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Receive the member's OWN posts, captured by the Aura browser extension on their LinkedIn activity page. This is the ongoing counterpart to the one-off data-export import: it keeps the corpus growing without the member downloading anything again. Only their own posts, only from their own activity page.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `test-linkedin-scrape`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** READ-ONLY test harness: prove LinkedIn post fetching via Apify. Founder-gated. No database writes. No AI calls.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ urls: [resolved_url], maxPosts: max_posts }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `APIFY_TOKEN`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_connections`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `transcribe-voice`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Auth check
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "Audio file is required" }` / `{ error: "Rate limit exceeded. Please try again later." }` / `{ error: "Credits exhausted. Please add funds." }`
- **HTTP statuses returned:** 400, 401, 402, 422, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `captures`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `trend-why-matters`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/trend-why-matters/index.ts
- **Input payload:** `{ headline, insight }`
- **Output shape (JSON.stringify keys seen):** `{ error: "headline required" }` / `{ error: "unauthorized" }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: `You are Aura. You know this professional's focus: ${sector }` / `{ error: "ai_failed" }`
- **HTTP statuses returned:** 400, 401, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/pages/TrendDetail.tsx`

## `update-user-password`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** UNKNOWN - no header comment; read supabase/functions/update-user-password/index.ts
- **Input payload:** `{ new_password }`
- **Output shape (JSON.stringify keys seen):** `{ error: "Password must be at least 8 characters" }` / `{ error: "Password update failed" }` / `{ success: true }` / `{ error: "An unexpected error occurred" }`
- **HTTP statuses returned:** 400, 500
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/SetPasswordModal.tsx`, `src/pages/Auth.tsx`

## `voice-classify-posts`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Label the opening and the ending of every post the member wrote. Deterministic rules decide most rows for free; only the genuinely ambiguous ones reach the model, batched, so filling a 400-post history costs a handful of calls rather than four hundred. A non-null label is never overwritten, with one deliberate exception: `{ reclassify_other: true }` re-runs the model over rows already parked in `other`, with the strict definitions prompt, and may replace `other` with a real label. It can never replace a real label.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: system }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/voice/TeachAura.tsx`, `src/pages/Onboarding.tsx`

## `voice-compute-outcomes`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Read what actually happened to the member's published posts. This function writes no opinions. It measures each published post with the one shared trait module and records how the post did against the member's OWN trailing median — never against another member and never against an absolute. Idempotent: one row per post, upserted. PERFORMANCE SOURCE — a fallback chain, because the two pipelines barely overlap: a. `linkedin_post_metrics`, newest snapshot, when one exists. Richer: it carries impressions, so a true engagement RATE is available.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_post_metrics`, `linkedin_posts`, `linkedin_profile_snapshots`, `voice_post_outcomes`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `voice-compute-traits`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** Measure a member's voice traits from the posts they actually wrote. Pure text arithmetic — no AI calls, no estimation. A trait with no evidence is simply absent: the surfaces above this read "unknown", never zero. Traits are ROWS keyed by `voice_trait_registry.trait_key`. Adding a new dimension means one registry insert plus one branch in `measure()` — never a migration.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ user_id: userId }`
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `linkedin_posts`, `voice_distribution`, `voice_rules`, `voice_trait_registry`, `voice_traits`
- **RPCs called:** `voice_profile_readiness`
- **Other functions invoked over HTTP:** `voice-suggest-rules`, `voice-distill`
- **Called from:** `src/components/voice/TeachAura.tsx`, `src/pages/Onboarding.tsx`

## `voice-distill`

- **JWT verification:** false
- **Purpose (verbatim from the file header):** What the member actually did: every draft they rewrote, as the pair (what Aura generated, what they saved). This is the only honest source of evidence for what a member avoids, and the only source of contradictions.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ error: "sweep_retired" }` / `{ error: "user_id is required" }` / `{ error: "unstamped_posts", details: "Pasted posts must be stamped source: 'member_added'." }`
- **HTTP statuses returned:** 200, 400, 401, 410, 500
- **Secrets / env read:** `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `ef_error_log`, `linkedin_posts`, `training_logs`, `user_milestones`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/VoiceEngineSection.tsx`, `src/lib/teachAura.ts`

## `voice-learn-from-outcomes`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Turn what worked into PROPOSALS — never into changes. Doing nothing is the correct output most of the time, and is reported as a result rather than hidden. Every proposal is capped at ±5 points a run, is clamped to the band the member's own writing proves, and lands in `voice_traits` with `source='aura'` and a null `last_confirmed_at` — the same Confirm / Reject mechanism every other Aura suggestion uses. There is no parallel path, no auto-apply, and no way to reach a locked or member-set trait.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`, `voice_learning_prefs`, `voice_post_outcomes`, `voice_trait_rejections`, `voice_traits`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/lib/voiceOutcomes.ts`

## `voice-profile-cleanup`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** One-off (re-runnable) hygiene pass over every voice profile. Applies exactly what the live write path applies: the avoid and use lists are semantically deduplicated and capped at 12, example posts are migrated to `{content, source, added_at}`, junk entries are dropped, any nested `example_posts_levantine_backup` is promoted, and examples are capped at 10. Service-role or cron only.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_voice_profiles`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

## `voice-sample`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Generate ONE sample post in the member's configured voice. Called only when the member presses "Another sample" on the Voice & Writing tab — every other interaction on that panel is composed client-side from a template bank, so clicking around costs nothing.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** none
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/VoiceEngineSection.tsx`, `src/components/voice/TestImprove.tsx`

## `voice-suggest-rules`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** Propose writing rules from the member's own posts — never from generic writing advice. Two passes. The first counts patterns and can always show its working. The second asks a model for the things counting cannot express (recurring stances, themes) and DISCARDS anything that does not cite post ids. Everything written here lands as `status = 'suggested'`. A suggestion is a proposal: it does not reach the generator until the member accepts it.
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `linkedin_posts`, `voice_rules`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/lib/voiceDna.ts`

## `wait-estimate`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** WAIT-ESTIMATE — how long this actually takes, from the runs we actually made. No modelling, no guessing. It reads `operation_runs` for FINISHED runs of one operation over the last 30 days (most recent 200) — successes and failures both, because a median built from successes only is optimistic by construction — and returns the median, the 95th percentile, and the same two figures per stage. Below ten real runs we do not know, so we say nothing: { insufficient: true }. Stages are ALL returned, each with its own sample count, and the client
- **Input payload:** reads `await req.json()` without top-level destructuring — UNKNOWN, read the file
- **Output shape (JSON.stringify keys seen):** UNKNOWN
- **HTTP statuses returned:** 200 only
- **Secrets / env read:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `operation_runs`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/lib/waitEstimate.ts`

## `weekly-influence-brief`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** THE DICTIONARY (Deno twin of src/constants/vocabulary.ts) — count nouns only from here.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Unauthorized" }` / `{ model: "google/gemini-3-flash-preview", messages: [ { role: "system", content: systemPrompt }` / `{ error: "Rate limited. Please try again shortly." }` / `{ error: "AI credits exhausted. Please add funds." }`
- **HTTP statuses returned:** 401, 402, 429, 500
- **Secrets / env read:** `LOVABLE_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`
- **Tables touched:** `authority_scores`, `influence_snapshots`, `linkedin_posts`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** `src/components/influence/WeeklyInfluenceBrief.tsx`

## `weekly-progress-summary`

- **JWT verification:** true (no config.toml entry — platform default)
- **Purpose (verbatim from the file header):** THE DICTIONARY (Deno twin of src/constants/vocabulary.ts) — count nouns only from here.
- **Input payload:** no JSON body (GET / cron trigger / query params)
- **Output shape (JSON.stringify keys seen):** `{ error: "Forbidden" }` / `{ message: "No users to notify" }` / `{ sent: notifications.length }` / `{ error: error.message }`
- **HTTP statuses returned:** 403, 500
- **Secrets / env read:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **Tables touched:** `diagnostic_profiles`, `entries`, `imprint_snapshots`, `linkedin_posts`, `notifications`
- **RPCs called:** none
- **Other functions invoked over HTTP:** none
- **Called from:** no `functions.invoke` caller in the repo — cron job, webhook, or manual invoke only

