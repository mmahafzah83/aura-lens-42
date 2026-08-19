/**
 * seatCopy — the single source of truth for the founding-seat offer.
 * Shared by ReadTierHome, ReadShape, the onboarding seat panel,
 * /request-access and the landing so no two surfaces drift.
 *
 * The offer leads with ONE job. Everything else is how that job stays true.
 */

export const SEAT_HEADING = "The read told you where you stand. It can't move you.";

export const SEAT_LEAD =
  "What you have now is a photograph. It was accurate this morning and it will be wrong by next quarter, because the market moves and your record doesn't move with it.";

export const SEAT_ONE_JOB =
  "Aura keeps your position true — and works on it every week without adding work to your week.";

export const SEAT_HOW_LABEL = "How it stays true";

export const SEAT_HOW = [
  "Position rewritten when your evidence changes",
  "What moved in your sector this week, read against your record",
  "Drafts in your own voice from what you already know",
  "One honest number for whether your standing is growing",
] as const;

/** The shopper's answer: why Aura is not another creator tool. */
export const SEAT_VS_TOOLS =
  "The creator tools give you posts. Aura reads you first — then keeps your position true.";

/** Kept for the surfaces that render the "how" as a plain row list. */
export const SEAT_ROWS = SEAT_HOW;

export const SEAT_PRICE = "$69 a month";
export const SEAT_PRICE_SUBLINE =
  "Founding seat: this price is locked for as long as you keep it, and I onboard you personally.";
export const SEAT_CONSTRAINT = "I can personally onboard fifty people. That is the constraint.";

export const SEAT_CTA = "Reserve my seat at $69";
export const SEAT_CTA_SECONDARY = "Just keep me posted";
export const SEAT_PATH = "/request-access";

export const SEAT_RESERVE_NOTE =
  "No card. Nothing is charged. Aura isn't open yet — you're telling me you want in at this price, and I'll come to you when it is.";

export const SEAT_CAP = 50;
export const SEAT_WAVE_SIZE = 10;
export const SEAT_NO_CARD =
  "No card today. You are not charged until Aura is publishing for you.";
export const SEAT_PROMISE =
  "See yourself for free. Take a seat only if what you see is worth keeping up.";

/** The two doors. The recorded difference between them is the whole measurement. */
export const INTENT_RESERVE = "reserve_69";
export const INTENT_KEEP_POSTED = "keep_posted";
export type SeatIntent = typeof INTENT_RESERVE | typeof INTENT_KEEP_POSTED;

/** Confirmation after a reservation. */
export const RESERVED_TAG = "reserved";
export const RESERVED_TITLE = "You're in. I'll come to you myself.";
export const RESERVED_BODY =
  "Not an automated queue — I open seats in small waves and write to people individually.";
export const WORTH_QUESTION =
  "What would have to be true, in three months, for this to have been worth $69 a month?";
export const WORTH_PLACEHOLDER = "Optional. One or two lines is plenty.";
export const WORTH_SEND = "Send";
export const WORTH_SKIP = "Skip this";
export const WORTH_THANKS = "Thank you — that's with me.";

/** Confirmation after "just keep me posted". */
export const POSTED_TITLE = "You'll hear from me when it opens.";

/** Reservations counted, never invented. */
export const SEAT_RACK_LABEL = (claimed: number, cap: number = SEAT_CAP) =>
  `${claimed} of ${cap} reserved`;

/**
 * waveFrom — the single arithmetic for the founding waves.
 * Returns null once the cap is reached: there is no sixth wave.
 */
export type Wave = {
  wave: number;
  inWave: number;
  leftWave: number;
  chip: string;
  note: string;
};

export function waveFrom(claimed: number, cap: number = SEAT_CAP): Wave | null {
  const taken = Math.max(0, Math.floor(claimed));
  if (taken >= cap) return null;
  const size = SEAT_WAVE_SIZE;
  const wave = Math.floor(taken / size) + 1;
  const inWave = taken % size;
  const leftWave = size - inWave;
  const note =
    wave === 1
      ? `${inWave} of the first ten are taken. When wave one closes, wave two opens — same price, same lock.`
      : `Wave ${wave - 1} is full. ${inWave} of wave ${wave}'s ten are taken — same price, same lock.`;
  return { wave, inWave, leftWave, chip: `Wave ${wave} · ${leftWave} left`, note };
}

export const SEAT_SOLD_OUT_NOTE =
  "The founding fifty are taken. Tell me anyway and I'll write to you when a seat opens.";
