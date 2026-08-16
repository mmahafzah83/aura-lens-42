/**
 * limits.ts — the one place the cost controls live.
 * Opening sign-up opens a cost surface: every new account can trigger a
 * profile scrape, a posts scrape, an article fetch and a full instrument run.
 * Change the numbers here and nowhere else.
 */

export const LIMITS = {
  /** Accounts that may be created from one address fingerprint per rolling 24h. */
  SIGNUPS_PER_IP_PER_DAY: 3,
  /** Full instrument runs allowed per account, ever. */
  INSTRUMENT_RUNS_PER_ACCOUNT: 1,
  /** Full instrument runs allowed across the whole product per calendar day (UTC). */
  DAILY_INSTRUMENT_RUN_CEILING: 40,
  /** Email must be verified before any instrument run may start. */
  REQUIRE_VERIFIED_EMAIL: true,
} as const;

export const QUEUE_MESSAGE =
  "Aura is at today's limit. Leave your email and you are first in tomorrow — no place is lost.";

export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aura:${ip}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
