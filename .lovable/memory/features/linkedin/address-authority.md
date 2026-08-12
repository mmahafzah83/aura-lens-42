---
name: LinkedIn address authority
description: A member's LinkedIn address is established from their own OAuth token, never derived from their display name
type: feature
---
Law: the address comes from the token, never from the name.

- On connect and on every successful read, call LinkedIn's profile endpoint with the member's own access token and take handle, profile_url and profile_name from that response only.
- `source_status` values in use: `verified_by_read` (API returned a public handle), `confirmed_by_identity` (API returned only a member id), `member_entered` (the member typed it), `missing`.
- `guessed_from_name` is retired. Never derive a handle from a display name — reject bad input, do not launder it.
- Handles must be strict ASCII vanity slugs; a database CHECK (`linkedin_connections_handle_is_vanity`) enforces this.
- Reads and posts refuse to run unless `source_status` is one of the trusted three.
- `linkedin-identity-backfill` is the admin/server-only pass that re-establishes addresses and probes `can_post`; it accepts a proven service-role key or an admin session, records one outcome per member in `ef_error_log`, and never retries a 401.
- A 401 from LinkedIn means the member must reconnect: the connection is set to `needs_reconnect` and Settings shows a "Reconnect LinkedIn" button.
