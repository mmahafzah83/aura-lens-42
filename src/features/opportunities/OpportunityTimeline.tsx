/**
 * WHAT HAPPENS NEXT — five steps, each with a real date or an honest estimate.
 *
 * The member should never have to guess where an opportunity stands. Every
 * step carries either a date that exists in the record or a plainly-labelled
 * expectation. Nothing is invented: when we do not know, the line says so.
 *
 * A cyan dot means the step is done, a blue ring means it is his turn, amber
 * means a clock is running (a closing date inside seven days).
 */
import type { Vocab } from "./useVocab";
import { Tip } from "./Tip";

type Lang = "en" | "ar";
type State = "done" | "turn" | "clock" | "waiting";

const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const ACT = "#0670C4";
const CYAN = "#00CEC9";
const AMBER = "#E0A82E";
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;

const fill = (text: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((value, [key, item]) => value.split(`{${key}}`).join(String(item)), text);

export function tlDate(value: string | null | undefined, language: Lang) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-ca-gregory" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Judging runs at half past every even hour. This is the next one. */
export function nextJudgeRun(now = new Date()): Date {
  const next = new Date(now.getTime());
  next.setUTCSeconds(0, 0);
  for (let step = 0; step < 26; step++) {
    const candidate = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(),
      next.getUTCHours() + step, 30, 0, 0));
    if (candidate.getUTCHours() % 2 === 0 && candidate.getTime() > now.getTime()) return candidate;
  }
  return next;
}

function clockTime(date: Date, language: Lang) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-ca-gregory" : "en-GB",
    { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(date);
}

const daysAway = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
};

const addDays = (value: string, days: number) =>
  new Date(new Date(`${String(value).slice(0, 10)}T12:00:00Z`).getTime() + days * 86_400_000).toISOString();

function Dot({ state }: { state: State }) {
  const base: React.CSSProperties = {
    inlineSize: 10, blockSize: 10, borderRadius: 999, marginBlockStart: 4, flex: "0 0 10px",
  };
  if (state === "done") return <span aria-hidden style={{ ...base, background: CYAN }} />;
  if (state === "turn") return <span aria-hidden style={{ ...base, background: "#FFFFFF", border: `2px solid ${ACT}` }} />;
  if (state === "clock") return <span aria-hidden style={{ ...base, background: AMBER }} />;
  return <span aria-hidden style={{ ...base, background: "#FFFFFF", border: `2px solid ${LINE}` }} />;
}

function Step({ state, title, lines, last }: { state: State; title: string; lines: Array<{ text: string; dated?: boolean }>; last?: boolean }) {
  return <li style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch" }}>
      <Dot state={state} />
      {!last && <span aria-hidden style={{ flex: 1, inlineSize: 1, background: LINE, marginBlockStart: 4 }} />}
    </span>
    <span style={{ display: "block", paddingBlockEnd: last ? 0 : 12, minInlineSize: 0 }}>
      <strong style={{ display: "block", fontSize: 12, fontWeight: 600, color: INK }}>{title}</strong>
      {lines.filter((line) => line.text).map((line, index) =>
        <span key={index} style={{ display: "block", marginBlockStart: 2, fontSize: 12, color: MUTED, ...(line.dated ? mono : {}) }}>{line.text}</span>)}
    </span>
  </li>;
}

export type TimelineFacts = {
  issuer: string | null;
  first_seen_at: string | null;
  judged: boolean | null;
  judged_at?: string | null;
  card_date?: string | null;
  deadline?: string | null;
};

export default function OpportunityTimeline({ facts, v, language, askAfterDays = 14 }: {
  facts: TimelineFacts; v: Vocab; language: Lang; askAfterDays?: number;
}) {
  const expected = v("tl_expected");
  const closingIn = daysAway(facts.deadline);
  const clockRunning = closingIn !== null && closingIn >= 0 && closingIn <= 7;

  const foundLine = facts.first_seen_at
    ? fill(v("tl_found_line"), { date: tlDate(facts.first_seen_at, language), issuer: facts.issuer ?? "—" })
    : "";

  const judged = facts.judged === true;
  const checkLines = judged
    ? [{ text: tlDate(facts.judged_at ?? facts.first_seen_at, language), dated: true }]
    : [{ text: `${fill(v("tl_checked_expected"), { time: clockTime(nextJudgeRun(), language) })} · ${expected}`, dated: true }];

  const carded = Boolean(facts.card_date);
  const cardLines = carded
    ? [{ text: fill(v("tl_card_shown"), { date: tlDate(facts.card_date, language) }), dated: true }]
    : [{ text: `${v("tl_card_expected")} · ${expected}` }];

  const followLines = [
    { text: facts.deadline ? fill(v("tl_closes"), { date: tlDate(facts.deadline, language) }) : v("tl_no_closing"), dated: Boolean(facts.deadline) },
    ...(carded ? [{ text: `${fill(v("tl_ask_on"), { date: tlDate(addDays(String(facts.card_date), askAfterDays), language) })} · ${expected}`, dated: true }] : []),
  ];

  return <><div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: 4 }}><Tip v={v} k="tip_timeline" /></div><ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
    <Step state="done" title={v("tl_found")} lines={[{ text: foundLine }]} />
    <Step state={judged ? "done" : "waiting"} title={v("tl_checked")} lines={checkLines} />
    <Step state={carded ? "done" : "waiting"} title={v("tl_card")} lines={cardLines} />
    <Step state={carded ? "turn" : "waiting"} title={v("tl_move")} lines={[{ text: v("tl_move_line") }]} />
    <Step state={clockRunning ? "clock" : "waiting"} title={v("tl_followup")} lines={followLines} last />
  </ol></>;
}
