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
export const SEAT_PRICE_SUBLINE = "For as long as you stay. It will be $69. Fifty seats.";
export const SEAT_CTA = "Ask for a founding seat";
export const SEAT_PATH = "/request-access";
