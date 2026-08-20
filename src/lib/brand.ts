/** The single source of truth for how Aura describes itself. Never inline this. */
export const PRODUCT_DESCRIPTOR = "AI Professional Identity Platform";
export const PRODUCT_DESCRIPTOR_CAPS = "AI PROFESSIONAL IDENTITY PLATFORM";

/**
 * THE SIZE OF THE JOURNEY — one place, everywhere.
 *
 * The flow contradicted itself (five steps / nine questions / nine minutes /
 * fifteen minutes) because every surface carried its own literal. Nothing outside
 * this file may print a step, question or minute count.
 */
export const ASSESSMENT_STEPS = 5;
export const ASSESSMENT_QUESTIONS = 9;
export const ASSESSMENT_MINUTES = 15;

/** The fast promise. Everything else is the total journey. */
export const FIRST_READ_LINE = "Your first read in ninety seconds";
export const FIRST_READ_TIME = "90 seconds";
export const FIRST_READ_SHORT = "90 sec";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"] as const;
const word = (n: number) => WORDS[n] ?? String(n);

/** "five" */
export const ASSESSMENT_STEPS_WORD = word(ASSESSMENT_STEPS);
/** "nine" */
export const ASSESSMENT_QUESTIONS_WORD = word(ASSESSMENT_QUESTIONS);
/** "fifteen" */
export const ASSESSMENT_MINUTES_WORD = word(ASSESSMENT_MINUTES);

/** "About fifteen minutes" */
export const ASSESSMENT_MINUTES_LINE = `About ${ASSESSMENT_MINUTES_WORD} minutes`;
/** "ABOUT 15 MINUTES" */
export const ASSESSMENT_MINUTES_CAPS = `ABOUT ${ASSESSMENT_MINUTES} MINUTES`;
/** "15 min" */
export const ASSESSMENT_MINUTES_SHORT = `${ASSESSMENT_MINUTES} min`;
/** The honest total promise, derived from ASSESSMENT_MINUTES. */
export const FULL_PICTURE_LINE = `The full picture in about ${ASSESSMENT_MINUTES_WORD} minutes`;
/** "nine questions" */
export const ASSESSMENT_QUESTIONS_PHRASE = `${ASSESSMENT_QUESTIONS_WORD} questions`;
/** "Step 3 of 5" */
export const stepLabel = (n: number) => `Step ${n} of ${ASSESSMENT_STEPS}`;

/** The price truth, said the same way on every surface. */
export const REPORT_FREE_LINE =
  "Your report is free, and stays free. Private — only you can see it unless you share it.";

/**
 * THE FREE DOOR — one verb, one label, everywhere.
 * Nine different labels used to resolve to /assessment. Never inline these.
 */
export const FREE_CTA_LABEL = "Start with my LinkedIn";
export const FREE_CTA_SHORT_LABEL = "Start free";
/** "Start with my LinkedIn ↗" */
export const FREE_CTA = `${FREE_CTA_LABEL} ↗`;
/** "Start free ↗" — nav-width short form. */
export const FREE_CTA_SHORT = `${FREE_CTA_SHORT_LABEL} ↗`;
/** Screen-reader label for the step-1 hotspot in the journey diagram. */
export const FREE_CTA_ARIA = `${FREE_CTA_LABEL} — your free assessment`;
