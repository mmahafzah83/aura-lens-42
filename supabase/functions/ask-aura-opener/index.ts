import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SIGNAL, nCaptures } from "../_shared/vocabulary.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Chip = { label: string; prompt: string };
type Opener = { kind: string; text: string; chips: Chip[] };

const ELSE: Chip = { label: "Something else", prompt: "Let's talk about something else." };

/* ── THE VOICE CONTRACT ───────────────────────────────────────────────
 * This is the system prompt for any model that ever writes an opener, and
 * the specification `applyVoiceContract()` enforces on deterministic text.
 * It sits ON TOP of the six ordered rules (overnight → promise → draft →
 * unwritten signal → quiet radar → cold start). It does not change which
 * rule fires; it constrains what the fired rule is allowed to say.
 */
export const OPENER_VOICE_CONTRACT = `You write the first line a member reads. Obey all of the following.

1. TWO SENTENCES MAXIMUM. A short first sentence that says the one true thing, and a short second sentence that says what it means or what to do. Never a third.
2. ONE NUMBER, NEVER TWO. One figure per opener — a count of days, captures, signals or posts. Two numbers turns a greeting into a report. Prefer a number the member can feel ("since 2023", "six days") over a system count.
3. COUNTS, NOT ADJECTIVES. "You've written about cost eleven times" — never "you seem to focus on cost." Never characterise the member; only count him. No horoscope language.
4. NO ENTHUSIASM. Banned outright: "Great choice", "Awesome", "Love that", "Exciting", "I'm here to help", and any exclamation mark. The register is a senior chief of staff, not a helper. Respect, not cheer.
5. WARMTH IS A FACT, NOT A FEELING. Banned: "we miss you", "hope you're well", "it's been a while". If the member has been away, say the actual span: "You haven't been here since Thursday — six days." The date is the warmth.
6. NOTHING HAPPENING IS A PERMITTED OUTCOME. If there is genuinely no finding, no idle draft and no gap worth naming, the correct opener is a quiet one — "Quiet morning. Nothing needs you." — followed by one small optional suggestion. Do not manufacture urgency.
7. PLAIN SPEECH. Write the way you would say it out loud to a colleague in a corridor. Short words. Concrete nouns. Say what happened and why it touches him — never restate the source's abstract framing. A seven-year-old should be able to follow the sentence. Never quote a headline and paste its implication.
   Banned words and phrases: operating model, governance framework, paradigm, ecosystem, framework(s), landscape, holistic, robust, synergy, stakeholder alignment, digital transformation journey, at scale, going forward, in today's rapidly evolving, unlock, harness, navigate the complexities, rewriting the rules, reshaping, redefining, authority (noun), trajectory, personal brand, thought leader, leverage (verb), utilize, facilitate, seamless.`;

const BANNED = [
  /\bgreat choice\b/gi, /\bawesome\b/gi, /\blove that\b/gi, /\bexciting\b/gi,
  /\bi'?m here to help\b/gi, /\bwe miss you\b/gi, /\bhope you'?re well\b/gi,
  /\bit'?s been a while\b/gi,
];

/** Consultant abstraction. Any sentence carrying one of these is dropped. */
export const JARGON = [
  /\boperating models?\b/i, /\bgovernance frameworks?\b/i, /\bparadigms?\b/i,
  /\becosystems?\b/i, /\bframeworks?\b/i, /\blandscapes?\b/i, /\bholistic\b/i,
  /\brobust\b/i, /\bsynergy\b/i, /\bstakeholder alignment\b/i,
  /\bdigital transformation journey\b/i, /\bat scale\b/i, /\bgoing forward\b/i,
  /\bin today'?s rapidly evolving\b/i, /\bunlock\b/i, /\bharness\b/i,
  /\bnavigate the complexities\b/i, /\brewriting the rules\b/i, /\breshaping\b/i,
  /\bredefining\b/i, /\bauthority\b/i, /\btrajector(y|ies)\b/i,
  /\bpersonal brand\b/i, /\bthought leader(ship)?\b/i, /\bleverag(e|ing|es|ed)\b/i,
  /\butiliz(e|ing|es|ed)\b/i, /\bfacilitat(e|ing|es|ed)\b/i, /\bseamless(ly)?\b/i,
];

export const hasJargon = (s: string) => JARGON.some((re) => re.test(s));

const ABBREV = /(?:\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St|No|Inc|Ltd|Jr|Sr|approx|Fig|Prof)\.)$/i;

/**
 * Splits text into whole sentences. A boundary is `.`/`?`/`!` followed by
 * whitespace or end of string, and never inside a decimal ("3.5"), an
 * abbreviation ("e.g."), or a single initial ("J. Smith").
 * Returns `{ complete, trailing }` — `trailing` is any unterminated stump.
 */
export function splitSentences(input: string): { complete: string[]; trailing: string } {
  const t = String(input || "").trim();
  const complete: string[] = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c !== "." && c !== "?" && c !== "!") continue;
    const next = t[i + 1];
    // Must be followed by whitespace or end of string.
    if (next !== undefined && !/\s/.test(next)) continue;
    const chunk = t.slice(start, i + 1);
    // Decimal: digit . digit — already excluded by the whitespace rule, but a
    // trailing "3." before a space is still a number, not a boundary.
    if (c === "." && /\d\.$/.test(chunk) && /^\s*\d/.test(t.slice(i + 1))) continue;
    // Abbreviation or single initial.
    if (c === "." && (ABBREV.test(chunk.trim()) || /(^|\s)[A-Z]\.$/.test(chunk))) continue;
    complete.push(chunk.trim());
    start = i + 1;
  }
  return { complete: complete.filter(Boolean), trailing: t.slice(start).trim() };
}

const QUIET_FALLBACK = "Quiet morning. Nothing needs you.";

/** Enforces the contract on any opener text before it leaves this function. */
export function applyVoiceContract(input: string): string {
  let t = String(input || "").replace(/!+/g, ".").trim();
  for (const re of BANNED) t = t.replace(re, "").replace(/\s{2,}/g, " ").trim();

  // Only whole sentences survive. An unterminated stump is dropped, never emitted.
  const { complete } = splitSentences(t);
  // Plain speech: a sentence carrying consultant abstraction is dropped whole.
  let kept = complete.filter((s) => !hasJargon(s)).slice(0, 2);

  // One number, never two: drop the second sentence if both carry a figure.
  const hasNum = (s: string) => /\d/.test(s);
  if (kept.length === 2 && hasNum(kept[0]) && hasNum(kept[1])) kept = [kept[0]];

  const out = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!out || out.length < 20 || !/[.?]$/.test(out)) return QUIET_FALLBACK;
  return out;
}


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Invalid session" }, 401);

    // user_id comes only from the verified JWT, never from the request body.
    const user_id = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Optional hint from the caller. Identity never comes from the body — only
    // the finding id does, and it is re-checked against this member's rows.
    let requestedFindingId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.finding_id === "string" && body.finding_id.trim()) {
        requestedFindingId = body.finding_id.trim();
      }
    } catch (_e) { /* no body is fine */ }

    /* ── RULE 0 — overnight ── */
    const since36 = new Date(Date.now() - 36 * 3600000).toISOString();
    const { data: findingRows } = await admin
      .from("agent_findings")
      .select("id, title, url, implication, relevance_score, created_at")
      .eq("user_id", user_id)
      .in("status", ["pending", "kept"])
      .gte("created_at", since36)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(25);

    const usableFindings = ((findingRows || []) as any[]).filter(
      (f) => (typeof f.title === "string" && f.title.trim()) || (typeof f.url === "string" && f.url.trim()),
    );
    const finding =
      (requestedFindingId ? usableFindings.find((f) => f.id === requestedFindingId) : null) ||
      usableFindings[0] ||
      null;

    if (finding) {
      const title = String(finding.title || finding.url || "").trim();
      const implication = String(finding.implication || "").trim();
      const firstSentence = implication
        ? (implication.match(/^[^.!?]*[.!?]?/)?.[0] || implication).trim().slice(0, 140)
        : "";
      const second = firstSentence || "It is the newest thing on your radar and nothing has been done with it yet.";
      const out: Opener = {
        kind: "overnight",
        text: `While you slept I found this: "${title}". ${second}`,
        chips: [
          {
            label: "What does it mean for me?",
            prompt: `What does "${title}" mean for my position, and what should I do about it?`,
          },
          {
            label: "Draft from it",
            prompt: `Draft a post from the overnight finding "${title}", using my own captures as the evidence.`,
          },
          ELSE,
        ],
      };
      out.text = applyVoiceContract(out.text);
      return json(out);
    }


    /* ── RULE 1 — promise ── */
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: memRows } = await admin
      .from("aura_conversation_memory")
      .select("actions_committed, created_at")
      .eq("user_id", user_id)
      .is("role", null)
      .not("actions_committed", "is", null)
      .gte("created_at", since14)
      .order("created_at", { ascending: false })
      .limit(5);

    const promiseRow = (memRows || []).find(
      (r: any) =>
        Array.isArray(r.actions_committed) &&
        r.actions_committed.length > 0 &&
        typeof r.actions_committed[0] === "string" &&
        r.actions_committed[0].trim(),
    );
    if (promiseRow) {
      const first = String((promiseRow as any).actions_committed[0]).trim();
      const out: Opener = {
        kind: "promise",
        text: `You said you would ${first}. Still the right move?`,
        chips: [
          { label: "Help me finish it", prompt: `Help me finish this: ${first}` },
          { label: "What changed since?", prompt: "What has changed in my signals since I said that?" },
          ELSE,
        ],
      };
      out.text = applyVoiceContract(out.text);
      return json(out);
    }

    /* ── RULE 2 — draft ── */
    const { data: draftRows } = await admin
      .from("linkedin_posts")
      .select("title, post_text, created_at")
      .eq("user_id", user_id)
      .eq("tracking_status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);

    const draft: any = draftRows?.[0] || null;
    if (draft) {
      const title = typeof draft.title === "string" ? draft.title.trim() : "";
      const body = typeof draft.post_text === "string" ? draft.post_text.trim() : "";
      const label = title || (body ? `${body.slice(0, 60)}…` : "");
      if (label) {
        const out: Opener = {
          kind: "draft",
          text: `You have a draft waiting — "${label}" — and nothing planned for it.`,
          chips: [
            { label: "Open it", prompt: `Show me my draft "${label}" and tell me honestly whether it is ready.` },
            { label: "Tighten it first", prompt: `Tighten my draft "${label}" — cut anything that is not carrying weight.` },
            ELSE,
          ],
        };
        out.text = applyVoiceContract(out.text);
      return json(out);
      }
    }

    /* ── RULE 3 — unwritten signal ── */
    const { data: sigRows } = await admin
      .from("strategic_signals")
      .select("id, signal_title, fragment_count, created_at, priority_score")
      .eq("user_id", user_id)
      .eq("status", "active")
      .order("priority_score", { ascending: false })
      .limit(25);

    const signals = (sigRows || []) as any[];
    if (signals.length) {
      const { data: usedRows } = await admin
        .from("linkedin_posts")
        .select("source_signal_id")
        .eq("user_id", user_id)
        .in("source_signal_id", signals.map((s) => s.id));
      const used = new Set((usedRows || []).map((r: any) => r.source_signal_id));
      const unwritten = signals.find((s) => !used.has(s.id));
      if (unwritten) {
        const n = daysSince(unwritten.created_at);
        const t = String(unwritten.signal_title);
        const subject = t + " " + SIGNAL.one;
        const out: Opener = {
          kind: "unwritten signal",
          text: `Your ${subject} has been live ${n} days. You have not written from it yet.`,
          chips: [

            { label: "Draft it", prompt: `Draft a post from my signal "${t}" using the evidence behind it.` },
            { label: "Show me the evidence", prompt: `What evidence sits behind "${t}"?` },
            ELSE,
          ],
        };
        out.text = applyVoiceContract(out.text);
      return json(out);
      }
    }

    /* ── RULE 4 — quiet radar ── */
    const { data: lastEntry } = await admin
      .from("entries")
      .select("created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastAt = lastEntry?.[0]?.created_at as string | undefined;
    if (lastAt) {
      const n = daysSince(lastAt);
      if (n > 7) {
        const out: Opener = {
          kind: "quiet radar",
          text: `Your last capture was ${n} days ago. There is still plenty here to work with.`,
          chips: [
            { label: "What is still live?", prompt: "Which of my signals are still worth acting on right now?" },
            { label: "What should I write?", prompt: "From what I have already captured, what should I write next?" },
            ELSE,
          ],
        };
        out.text = applyVoiceContract(out.text);
      return json(out);
      }
    }

    /* ── RULE 5 — cold start ── */
    const [{ count: entryCount }, { count: signalCount }] = await Promise.all([
      admin.from("entries").select("id", { count: "exact", head: true }).eq("user_id", user_id),
      admin
        .from("strategic_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("status", "active"),
    ]);
    const E = entryCount ?? 0;
    const S = signalCount ?? 0;

    if (E === 0 && S === 0) {
      return json({
        kind: "cold start",
        text: applyVoiceContract("I do not have anything of yours to read yet. Capture one article and I will have something to say about it."),
        chips: [
          {
            label: "What should I capture?",
            prompt: "What kind of sources are actually worth capturing for someone in my position?",
          },
        ],
      } satisfies Opener);
    }

    return json({
      kind: "cold start",
      text: applyVoiceContract(`Quiet morning. Nothing needs you — ${nCaptures(E, "en")} sit here when you want them.`),
      chips: [
        { label: "What can you see?", prompt: "What can you actually see in my graph right now?" },
        { label: "What should I write?", prompt: "From what I have already captured, what should I write next?" },
      ],
    } satisfies Opener);
  } catch (e) {
    console.error("ask-aura-opener failed:", e);
    return json({ error: "opener unavailable" }, 500);
  }
});
