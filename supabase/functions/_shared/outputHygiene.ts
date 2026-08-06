/**
 * Output hygiene: what a member is shown must be whole, readable text that
 * respects their own profile bans.
 *
 * Three jobs, all deterministic and shared by every generator:
 *   1. Right-to-left safety — the sub-point glyphs ↳ / ↲ are left-to-right
 *      arrows that point the wrong way inside Arabic. Arabic output gets a
 *      neutral marker instead.
 *   2. Profile bans — a member whose avoid list rules out emoji must never be
 *      handed emoji. The ban is enforced on the finished text, not suggested
 *      to the model.
 *   3. Text integrity — no sentence may end on a dangling particle, no line may
 *      start with whitespace or stray punctuation, no line may be an orphaned
 *      fragment. Broken text is regenerated or discarded, never shown.
 */

/** The marker Arabic output uses in place of the LTR sub-point arrows. */
export const NEUTRAL_SUB_MARKER = "–";

const RTL_UNSAFE_MARKERS = /[↳↲]/g;
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/** Arabic text never carries ↳ or ↲; every other script keeps its markers. */
export function neutralizeRtlMarkers(text: string, isArabic?: boolean): string {
  const t = String(text ?? "");
  if (!t) return t;
  const arabic = isArabic ?? ARABIC_SCRIPT.test(t);
  if (!arabic) return t;
  return t.replace(RTL_UNSAFE_MARKERS, NEUTRAL_SUB_MARKER);
}

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu;

export function containsEmoji(text: string): boolean {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(String(text ?? ""));
}

/** Remove every emoji / pictographic marker, leaving the prose intact. */
export function stripEmoji(text: string): string {
  return String(text ?? "")
    .replace(EMOJI_RE, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMOJI_BAN_PATTERNS = [
  /no\s+emoji/i,
  /without\s+emoji/i,
  /avoid\s+emoji/i,
  /never\s+use[^.]*emoji/i,
  /لا\s*(?:ي|ت)?(?:ستخدم|ستعمل)?\s*(?:ال)?إيموجي/,
  /بدون\s*(?:ال)?إيموجي/,
  /(?:ال)?رموز\s*التعبيرية/,
];

/** Does this member's avoid list rule out emoji? */
export function profileBansEmoji(avoid: unknown): boolean {
  const list = Array.isArray(avoid) ? avoid : [];
  return list.some((raw) => {
    const s = String(raw ?? "");
    return EMOJI_BAN_PATTERNS.some((re) => re.test(s));
  });
}

/* ── Text integrity ─────────────────────────────────────────────────────── */

const AR_DANGLING = [
  "منذ", "على", "من", "في", "عن", "إلى", "الى", "خلال", "حتى", "نحو", "بين",
  "لدى", "مع", "عند", "ضمن", "حول", "دون", "بلا", "أو", "و", "ثم", "لكن", "أن", "إن", "التي", "الذي",
];
const EN_DANGLING = [
  "of", "on", "in", "at", "to", "for", "from", "with", "by", "about", "during",
  "since", "into", "onto", "over", "under", "than", "and", "or", "but", "the", "a", "an", "that", "which",
];
const DANGLING = new Set([...AR_DANGLING, ...EN_DANGLING]);

const BULLET_START = /^(?:[◆•\-–—*↳↲✓>]|[0-9٠-٩]{1,2}\s*[.)-]|["“«'(])/;
const BAD_PUNCT_START = /^[,،؛;:.!?؟%=+\/\\)\]}»”…]/;

const HASHTAG_LINE = /^\s*(?:#[^\s#]+\s*)+$/;
const SIGNATURE_LINE = /^\s*(?:[—–-]{1,2}\s*\S|✍|Signed|توقيع)/;

/**
 * The body a member actually reads: hashtag blocks and a trailing signature
 * line are decoration, not prose, and must not be judged as sentences.
 */
function bodyLinesOf(raw: string): string[] {
  const lines = raw.split("\n");
  while (lines.length) {
    const last = lines[lines.length - 1];
    if (!last.trim() || HASHTAG_LINE.test(last) || SIGNATURE_LINE.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines;
}

const sentencesOf = (line: string) =>
  line.split(/(?<=[.!?؟…])\s+/).map((s) => s.trim()).filter(Boolean);

const lastWord = (sentence: string) =>
  sentence
    .replace(/[.!?؟…"”»'’)\]}]+$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .pop() ?? "";

export interface IntegrityResult {
  ok: boolean;
  issues: string[];
}

/**
 * Reject text a member should never see: cut sentences, orphaned fragments,
 * lines that begin mid-thought.
 */
export function checkTextIntegrity(text: string, _isArabic?: boolean): IntegrityResult {
  const issues: string[] = [];
  const raw = String(text ?? "");
  if (!raw.trim()) return { ok: false, issues: ["empty"] };

  const lines = bodyLinesOf(raw);
  if (!lines.join("\n").trim()) return { ok: false, issues: ["empty"] };

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    // An orphan is a line that BEGINS mid-thought — never merely a short line.
    // Arabic LinkedIn prose is written one line per paragraph by design.
    if (/^[ \t]+\S/.test(line)) issues.push(`line ${i + 1} starts with whitespace`);
    const t = line.trim();
    if (BAD_PUNCT_START.test(t)) issues.push(`line ${i + 1} starts with punctuation`);

    // "= consequence" with nothing on the left is a severed clause.
    if (/^[^=\n]{0,3}=/.test(t)) issues.push(`line ${i + 1} is a severed equation`);
  });

  // A dangling particle only matters where the text stops: mid-text particles
  // are ordinary Arabic and English grammar.
  const lastBody = [...lines].reverse().find((l) => l.trim());
  if (lastBody) {
    const sentences = sentencesOf(lastBody.trim());
    const finalSentence = sentences[sentences.length - 1] ?? "";
    const w = lastWord(finalSentence).toLowerCase();
    if (w && DANGLING.has(w)) issues.push(`text ends on a dangling particle "${w}"`);
  }

  return { ok: issues.length === 0, issues };
}
