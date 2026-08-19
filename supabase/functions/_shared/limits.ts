/**
 * limits.ts — the one place the cost controls live.
 * Opening sign-up opens a cost surface: every new account can trigger a
 * profile scrape, a posts scrape, an article fetch and a full instrument run.
 * Change the numbers here and nowhere else.
 */

export const LIMITS = {
  /** Accounts that may be created from one address fingerprint per rolling 24h. */
  SIGNUPS_PER_IP_PER_DAY: 100,
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

/**
 * The caller's address, or an empty string when no address header is present.
 *
 * An empty string is deliberate: a literal placeholder string pools every
 * header-less caller on earth into one bucket, so the last of them globally is
 * refused for reasons that have nothing to do with them. Callers must treat an
 * empty value as no fingerprint and skip the limit check entirely rather than
 * count the request against a shared bucket.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    ""
  );
}
