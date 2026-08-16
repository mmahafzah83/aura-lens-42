/**
 * seatCopy — the single source of truth for the founding-seat CTA block.
 * Shared by ReadTierHome and ReadShape so the two surfaces never drift.
 */

export const SEAT_HEADING = "What a founding seat opens";

export const SEAT_ROWS = [
  "Capture — everything you read, kept as evidence",
  "Signals — your field, read overnight, matched to your read",
  "Drafts — written from what you saved, never from a prompt",
] as const;

export const SEAT_PRICE = "$29 a month";
export const SEAT_PRICE_SUBLINE = "The founding rate, for as long as you stay. $69 from seat 51.";
export const SEAT_CTA = "Take a founding seat";
export const SEAT_PATH = "/request-access";

// New — used by the landing price block and the reveal seat panel
export const SEAT_LIST_PRICE = "$69";
export const SEAT_CAP = 50;
export const SEAT_WAVE_SIZE = 10;
export const SEAT_NO_CARD =
  "No card today. Billing opens only when Aura has published a post for someone who is not the founder.";
export const SEAT_PROMISE =
  "See yourself for free. Take a seat only if what you see is worth keeping up.";
