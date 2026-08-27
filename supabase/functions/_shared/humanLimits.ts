/**
 * HUMAN LIMITS — when the member says something human, it is not a content
 * opportunity.
 *
 * The prompt rule did not hold: "my father is ill" kept becoming a subject to
 * write about, and "I worked 90 hours" kept becoming "we should scale back
 * your output" — which is both a content answer and a promise of a capability
 * the Desk does not have. So the decision is made in code, before the model is
 * asked anything: the turn is flagged, no tool may fire, and whatever comes
 * back is stripped of work and capped at three sentences.
 */

const PATTERNS: RegExp[] = [
  // illness and health, his own or someone close
  /\b(i am|i'm|i've been|feeling)\s+(ill|sick|unwell)\b/i,
  /\b(my|our)\s+(father|dad|mother|mum|mom|wife|husband|son|daughter|child|kid|brother|sister|parent|family)\b[^.?!]{0,60}\b(ill|sick|unwell|hospital|surgery|dying|passed|died|funeral|diagnos\w+|cancer|stroke)\b/i,
  /\b(hospital|funeral|bereave\w*|passed away|in intensive care)\b/i,
  // exhaustion and burnout
  /\b(burn(?:ed|t)? out|burnout|exhaust(?:ed|ion)|running on empty|no energy left|can'?t keep (?:this|it) up|drained)\b/i,
  /\b\d{2,3}[- ]hour (?:week|weeks|days?)\b/i,
  // "worked 90 hours", "working 90 hours a week", "putting in 90+ hours"
  /\b(work\w*|doing|putting in|clocking)\s+(?:about\s+|around\s+|nearly\s+)?\d{2,3}\s*\+?\s*hours?\b/i,

  // overwhelm
  /\b(overwhelmed|drowning|too much on|falling behind on everything|breaking point)\b/i,
  // quitting and doubt about continuing
  /\b(i(?:'m| am) (?:going to |about to |thinking of |considering )?(?:quit|quitting|resign\w*|leaving my job|leaving the firm))\b/i,
  /\b(i want to quit|thinking about quitting|should i quit|give (?:this|it) up|walk away from (?:this|it|my job))\b/i,
  /\b(what(?:'s| is) the point|why (?:am i|do i) (?:even )?(?:bother|doing this))\b/i,
  // Arabic
  /(مريض|المستشفى|توفي|وفاة|جنازة|مرهق|إرهاق|متعب جدا|أستقيل|الاستقالة|أترك عملي|لا أستطيع الاستمرار)/,
];

export function isHumanLimitTurn(message: string): boolean {
  const m = String(message ?? "");
  if (!m.trim()) return false;
  return PATTERNS.some((re) => re.test(m));
}

/** Anything that is work, a promise, or a piece of product advice. */
const WORK_WORDS =
  /\b(draft\w*|post\w*|publish\w*|content|captur\w*|signal\w*|linkedin|pillar\w*|audience|engagement|cadence|schedul\w*|scaled? back|scale back|output|paus\w*|remind\w*|updat\w*|notif\w*|hold off|momentum|presence|visibility|writing|write)\b/i;

/**
 * A promise to stop, mute or hold something on his behalf. Aura cannot silence
 * anything, and a kind sentence that promises it is still a lie — it was the
 * last thing surviving this branch: "I will stop sending you reminders."
 */
const WORK_WORDS_AR =
  /(منشور|منشورات|مسودة|مسودات|نشر|محتوى|إشارة|إشارات|لينكد|جدول|تذكير)/;

const PROMISE = /\b(i(?:'ll| will| am going to| shall)|i'm going to|we(?:'ll| will| should)|let me)\b/i;
const PROMISE_AR = /(سأ|سوف أ|لن أ|دعني)/;

const MAX_SENTENCES = 3;
const SPLIT = /(?<=[.!?؟…])\s+/;

/**
 * Remove every sentence that turns his life into work, then cap the length.
 * A three-sentence answer that says nothing to do is the correct answer.
 */
export function stripWork(text: string, fallback: string): string {
  const body = String(text ?? "")
    .replace(/§§\w+/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const kept = body
    .split(SPLIT)
    .map((s) => s.trim())
    .filter((s) =>
      s.length > 0 &&
      !WORK_WORDS.test(s) &&
      !WORK_WORDS_AR.test(s) &&
      !PROMISE.test(s) &&
      !PROMISE_AR.test(s))
    .slice(0, MAX_SENTENCES);
  const out = kept.join(" ").trim();
  return out.length >= 12 ? out : fallback;
}

/** The whole instruction for this turn. Nothing else is in scope. */
export function humanLimitPrompt(lang: "Arabic" | "English", firstName?: string | null): string {
  return `You are Aura, and the person you work for has just told you something human — illness, loss, exhaustion, being overwhelmed, or doubt about carrying on${
    firstName ? `. His name is ${firstName}` : ""
  }.

This is not a content problem and you will not treat it as one.

Write your whole answer in ${lang}. At most three short sentences. Rules, all absolute:
- Acknowledge what he said, plainly, as a colleague would. No clinical language, no crisis script, no sympathy performance.
- Say that nothing here needs him and it will keep.
- You may offer exactly ONE thing, and it must REDUCE what is being asked of him. Never add anything.
- Do not mention drafts, posts, publishing, captures, signals, LinkedIn, cadence, output, momentum or presence. Not once.
- Promise him NOTHING. No sentence may begin "I will", "I'll" or "let me". You cannot pause, stop, mute, reschedule, notify, tidy, organise or handle anything on his behalf, and offering to is a lie however kind it sounds.
- No question that asks him to decide something. No next step. No task.

A good answer reads close to: "That matters more than any of this. Nothing here needs you — it will keep. Come back when you can."`;
}

export function humanLimitFallback(lang: "Arabic" | "English"): string {
  return lang === "Arabic"
    ? "هذا أهم من كل ما هنا. لا شيء هنا يحتاجك — سينتظر. عُد حين تستطيع."
    : "That matters more than any of this. Nothing here needs you — it will keep. Come back when you can.";
}
