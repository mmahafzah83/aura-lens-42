// home-address — THE CHIEF OF STAFF BRAIN
//
// Three phases, in order:
//   A. Facts   — SQL only. Every number Aura says out loud is computed here.
//   B. Decide  — lens + ranked moves, deterministic code. No model.
//   C. Address — the model writes prose from the facts. It never sees the DB
//                and never produces a number. A post-generation guard rejects
//                any integer that is not present in the facts object.
//
// Idempotent per (user_id, address_date) unless { force: true }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logEfError } from "../_shared/observe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "home-address";
const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const MODEL = "google/gemini-3-flash-preview";

// Ratified bands. Floor is inclusive; the last band is the top.
const BANDS: Array<{ key: string; name: string; floor: number }> = [
  { key: "observer",   name: "Observer",   floor: 0 },
  { key: "explorer",   name: "Explorer",   floor: 15 },
  { key: "strategist", name: "Strategist", floor: 35 },
  { key: "voice",      name: "Voice",      floor: 60 },
  { key: "presence",   name: "Presence",   floor: 80 },
];

function bandFor(imprint: number | null, tierKey: string | null) {
  let idx = -1;
  if (imprint != null) {
    for (let i = 0; i < BANDS.length; i++) if (imprint >= BANDS[i].floor) idx = i;
  } else if (tierKey) {
    idx = BANDS.findIndex((b) => b.key === tierKey);
  }
  if (idx < 0) return { name: null, next_band_name: null, points_to_next_band: null, at_top_band: false };
  const atTop = idx === BANDS.length - 1;
  const next = atTop ? null : BANDS[idx + 1];
  return {
    name: BANDS[idx].name,
    next_band_name: next?.name ?? null,
    points_to_next_band: next && imprint != null ? Math.max(0, next.floor - imprint) : null,
    at_top_band: atTop,
  };
}

// Fixed, non-judgemental. These facets cannot register before something ships.
const DORMANT_REASON =
  "Audience, discernment and conviction can only register once something has been published. They are dormant, not weak.";

const PUBLISHED_STATUSES = ["published", "confirmed"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}
function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ─────────────────────────────────────────────────────────── PHASE A: FACTS

type Facts = Record<string, any>;

async function gatherFacts(admin: SupabaseClient, userId: string): Promise<Facts> {
  const now = new Date();
  const today = dayKey(now);

  const [
    profileR, entriesR, fragR, sourcesR, signalsR, imprintR, facetsR,
    postsR, findingsR, contentR, connR,
  ] = await Promise.all([
    admin.from("diagnostic_profiles")
      .select("created_at, last_visit_at, last_active_at").eq("user_id", userId).maybeSingle(),
    admin.from("entries").select("id, created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(2000),
    admin.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("source_registry").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("strategic_signals")
      .select("id, signal_title, status, fragment_count, signal_velocity, velocity_status, created_at, updated_at, priority_score, supporting_evidence_ids")
      .eq("user_id", userId).order("priority_score", { ascending: false, nullsFirst: false }).limit(200),
    admin.from("imprint_snapshots").select("imprint, tier, components, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("facet_states").select("facet, value").eq("user_id", userId),
    admin.from("linkedin_posts")
      .select("id, title, post_text, tracking_status, created_at, published_at, publish_attempted_at, source_signal_id, source_metadata")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
    admin.from("agent_findings").select("id, status, themes, created_at")
      .eq("user_id", userId).gte("created_at", isoDaysAgo(1)),
    admin.from("content_items").select("id, title, signal_id, status, created_at")
      .eq("user_id", userId).gte("created_at", isoDaysAgo(1)),
    admin.from("linkedin_connections").select("id").eq("user_id", userId).eq("status", "active").limit(1),
  ]);

  const profile: any = profileR.data ?? {};
  const entries: any[] = entriesR.data ?? [];
  const signals: any[] = (signalsR.data ?? []);
  const posts: any[] = postsR.data ?? [];
  const facetRows: any[] = facetsR.data ?? [];

  // — signup / visit —
  const signup = profile.created_at ? new Date(profile.created_at) : null;
  const lastVisit = profile.last_visit_at ? new Date(profile.last_visit_at) : null;
  const days_since_signup = signup ? daysBetween(now, signup) : null;
  const days_since_last_visit = lastVisit ? daysBetween(now, lastVisit) : null;

  // — captures —
  const captures_total = entries.length;
  const last_capture_date = entries[0]?.created_at ? dayKey(new Date(entries[0].created_at)) : null;
  const weekAgo = Date.now() - 7 * 86400000;
  const captures_this_week = entries.filter((e) => new Date(e.created_at).getTime() >= weekAgo).length;
  const captured_today = last_capture_date === today;
  let weeks_with_a_capture_last_4 = 0;
  for (let w = 0; w < 4; w++) {
    const hi = Date.now() - w * 7 * 86400000;
    const lo = hi - 7 * 86400000;
    if (entries.some((e) => {
      const t = new Date(e.created_at).getTime();
      return t > lo && t <= hi;
    })) weeks_with_a_capture_last_4++;
  }

  // — signals —
  const active = signals.filter((s) => s.status === "active");
  const signals_active = active.length;
  const signals_accelerating = active.filter((s) => s.velocity_status === "accelerating").length;

  const signalIdsWithPublished = new Set<string>();
  for (const p of posts) {
    if (!PUBLISHED_STATUSES.includes(p.tracking_status)) continue;
    if (p.source_signal_id) signalIdsWithPublished.add(p.source_signal_id);
    const ids = p?.source_metadata?.signal_ids;
    if (Array.isArray(ids)) ids.forEach((i: string) => signalIdsWithPublished.add(i));
  }
  const signals_never_published_from =
    active.filter((s) => !signalIdsWithPublished.has(s.id)).length;

  const topRaw = active[0] ?? null;
  let top_signal: any = null;
  if (topRaw) {
    let first_fragment_date: string | null = null;
    const evIds: string[] = Array.isArray(topRaw.supporting_evidence_ids) ? topRaw.supporting_evidence_ids : [];
    if (evIds.length) {
      const { data: fr } = await admin.from("evidence_fragments")
        .select("created_at").in("id", evIds.slice(0, 100))
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (fr?.created_at) first_fragment_date = dayKey(new Date(fr.created_at));
    }
    // did it gain fragments in the last 7 days?
    let gained_last_7d = false;
    if (evIds.length) {
      const { count } = await admin.from("evidence_fragments")
        .select("id", { count: "exact", head: true })
        .in("id", evIds.slice(0, 100)).gte("created_at", isoDaysAgo(7));
      gained_last_7d = (count ?? 0) > 0;
    }
    top_signal = {
      id: topRaw.id,
      title: topRaw.signal_title,
      fragment_count: topRaw.fragment_count ?? 0,
      velocity: topRaw.velocity_status ?? null,
      first_fragment_date,
      gained_last_7d,
    };
  }

  // — imprint —
  const snap: any = imprintR.data ?? null;
  const imprint = snap?.imprint != null ? Math.round(Number(snap.imprint)) : null;
  const tierKey: string | null = snap?.tier ?? null;
  const band = bandFor(imprint, tierKey);
  // The scores live under components.score_components, not on components itself.
  const sc = snap?.components?.score_components ?? {};
  const num = (v: unknown) => (v == null || v === "" ? null : Math.round(Number(v)));
  const components = {
    signal: num(sc.signal_score),
    content: num(sc.content_score),
    capture: num(sc.capture_score),
  };

  // — facets —
  const facets = facetRows.map((f) => ({ facet: f.facet, value: Number(f.value) }));
  // Floats: exact-zero never fires. Below 0.05 is "has not registered yet".
  const facets_dormant = facets.filter((f) => f.value < 0.05).map((f) => f.facet);

  // — drafts / published —
  const drafts = posts.filter((p) => p.tracking_status === "draft");
  const drafts_total = drafts.length;
  const drafts_from_signals = drafts.filter(
    (p) => p.source_signal_id || (Array.isArray(p?.source_metadata?.signal_ids) && p.source_metadata.signal_ids.length),
  ).length;
  const publishedRows = posts.filter((p) => PUBLISHED_STATUSES.includes(p.tracking_status));
  const published_total = publishedRows.length;
  const published_through_aura = publishedRows.filter((p) => !!p.publish_attempted_at).length;
  const attempts = posts.filter((p) => !!p.publish_attempted_at);
  const publish_attempts = attempts.length;
  const last_publish_attempt = attempts
    .map((p) => p.publish_attempted_at)
    .sort()
    .reverse()[0] ?? null;

  // — last night —
  const findings: any[] = findingsR.data ?? [];
  const themes = new Set<string>();
  findings.forEach((f) => (f.themes ?? []).forEach((t: string) => themes.add(t)));
  const nightDrafts = posts.filter(
    (p) => p.tracking_status === "draft" && new Date(p.created_at).getTime() >= Date.now() - 86400000,
  );
  const contentItems: any[] = contentR.data ?? [];
  const newestSignalDraft = nightDrafts.find(
    (p) => p.source_signal_id || (Array.isArray(p?.source_metadata?.signal_ids) && p.source_metadata.signal_ids.length),
  ) ?? null;
  let newest_signal_draft: any = null;
  if (newestSignalDraft) {
    const sid = newestSignalDraft.source_signal_id || newestSignalDraft.source_metadata?.signal_ids?.[0] || null;
    const linked = signals.find((s) => s.id === sid) ?? null;
    newest_signal_draft = {
      id: newestSignalDraft.id,
      title: newestSignalDraft.title || (newestSignalDraft.post_text || "").slice(0, 80) || null,
      signal_id: sid,
      fragment_count: linked?.fragment_count ?? null,
    };
  }
  const last_night = {
    sources_read: findings.length,
    themes_strengthened: themes.size,
    drafts_written: nightDrafts.length + contentItems.filter((c) => c.status === "draft").length,
    newest_signal_draft,
  };

  return {
    as_of: today,
    days_since_signup,
    days_since_last_visit,
    last_capture_date,
    captured_today,
    captures_total,
    captures_this_week,
    weeks_with_a_capture_last_4,
    fragments_total: fragR.count ?? 0,
    distinct_sources: sourcesR.count ?? 0,
    signals_active,
    signals_accelerating,
    signals_never_published_from,
    top_signal,
    imprint,
    tier: band.name,
    components,
    points_to_next_band: band.points_to_next_band,
    next_band_name: band.next_band_name,
    at_top_band: band.at_top_band,
    facets,
    facets_dormant,
    facets_dormant_reason: facets_dormant.length ? DORMANT_REASON : null,
    drafts_total,
    drafts_from_signals,
    published_total,
    published_through_aura,
    publish_attempts,
    last_publish_attempt,
    last_night,
    linkedin_connected: (connR.data ?? []).length > 0,
  };
}

// ───────────────────────────────────────────────────────── PHASE B: DECIDE

function chooseLens(f: Facts): { lens: string; lens_reason: string } {
  const dss = f.days_since_signup;
  const dslv = f.days_since_last_visit;

  if (dss != null && dss <= 7) return { lens: "shape", lens_reason: "you are in your first week" };
  if (f.captures_total === 0) return { lens: "shape", lens_reason: "nothing has been captured yet" };
  if (f.published_through_aura === 0 && f.facets_dormant.length >= 2) {
    return { lens: "shape", lens_reason: "parts of your picture are still blank" };
  }
  if (dslv != null && dslv >= 3) {
    return { lens: "record", lens_reason: `you were away ${dslv} days` };
  }
  if (dss != null && dss >= 14) {
    return { lens: "record", lens_reason: "you have enough history to read a pattern" };
  }
  if (f.top_signal?.gained_last_7d && f.drafts_total > 0) {
    return { lens: "room", lens_reason: "your strongest signal moved this week and a draft is waiting" };
  }
  return { lens: "shape", lens_reason: "the picture is still forming" };
}

type Move = {
  rank: number; key: string; title: string; what: string; why: string;
  how: string; outcome: string; cta_route: string; est_minutes: number;
};

/**
 * Numbers in prose. A chief of staff says "six drafts", not "drafts_total is 6".
 * Above one hundred the digits read better, so digits it is.
 */
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function nw(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 20) return ONES[v];
  if (v < 100) return TENS[Math.floor(v / 10)] + (v % 10 ? `-${ONES[v % 10]}` : "");
  if (v < 1000) {
    const rest = v % 100;
    return `${ONES[Math.floor(v / 100)]} hundred${rest ? ` and ${nw(rest)}` : ""}`;
  }
  return String(v);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A field name, a snake_case token or a dot-path must never reach the member. */
const LEAK = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\b[a-z][a-z0-9_]*\.[a-z][a-z0-9_]+\b/;

/** Hand-written prose, correct by construction, used if a `why` ever leaks. */
function fallbackWhy(key: string, f: Facts): string {
  switch (key) {
    case "publish_draft":
      return `You have ${nw(f.drafts_total)} ${plural(f.drafts_total, "draft", "drafts")} waiting and ` +
        (f.published_through_aura > 0
          ? `only ${nw(f.published_through_aura)} ${plural(f.published_through_aura, "has", "have")} ever gone out.`
          : "none of them has ever gone out.");
    case "draft_from_signal":
      return `${cap(nw(f.signals_never_published_from))} of your themes have never produced a post, and your ` +
        `strongest has ${nw(f.top_signal?.fragment_count ?? 0)} fragments behind it.`;
    case "capture":
      return f.captures_this_week > 0
        ? `You have kept ${nw(f.captures_this_week)} ${plural(f.captures_this_week, "thing", "things")} this week, ` +
          `${nw(f.captures_total)} in all, and nothing today.`
        : `Nothing has been kept this week. Your record holds ${nw(f.captures_total)} ${plural(f.captures_total, "thing", "things")} in total.`;
    case "connect_linkedin":
      return f.published_total > 0
        ? `You have published ${nw(f.published_total)} ${plural(f.published_total, "post", "posts")} and Aura cannot see how any of them landed.`
        : "Aura cannot see how anything you post lands, so it cannot learn from it.";
    case "fill_facet":
      return `Your reading for ${f.facets_dormant[0] ?? "one part of the picture"} has nothing behind it yet.`;
    default:
      return "This is the shortest route from where you are to something published.";
  }
}

/** Last line of defence: no move leaves this function speaking in field names. */
function scrubMoves(moves: Move[], f: Facts): Move[] {
  return moves.map((m) => (LEAK.test(m.why) ? { ...m, why: fallbackWhy(m.key, f) } : m));
}

function chooseMoves(f: Facts): Move[] {
  const c: Omit<Move, "rank">[] = [];

  if (f.drafts_total > 0) {
    const d = f.last_night?.newest_signal_draft;
    c.push({
      key: "publish_draft",
      title: d?.title ? `Publish the draft on ${d.title}` : "Publish a waiting draft",
      what: "Read the draft Aura wrote, edit what does not sound like you, then publish it.",
      why: fallbackWhy("publish_draft", f),
      how: "Open the library, pick the draft, make your edits, press publish.",
      outcome: "One idea leaves your notes and reaches the people who need it.",
      cta_route: "/dashboard?tab=library",
      est_minutes: 8,
    });
  }

  if (f.signals_never_published_from > 0 && f.top_signal) {
    c.push({
      key: "draft_from_signal",
      title: `Turn "${f.top_signal.title}" into a post`,
      what: "Take your strongest unpublished signal into the composer and draft from it.",
      why: fallbackWhy("draft_from_signal", f),
      how: "Open the signal, read the evidence behind it, then send it to the composer.",
      outcome: "The reading you have already done becomes something publishable.",
      cta_route: "/dashboard?tab=signals",
      est_minutes: 12,
    });
  }

  if (!f.captured_today) {
    c.push({
      key: "capture",
      title: "Capture one thing you read today",
      what: "Paste a link, a report or a post you disagreed with.",
      why: fallbackWhy("capture", f),
      how: "Use the capture box on Home. A link is enough.",
      outcome: "Aura has something new to read tonight.",
      cta_route: "/dashboard?tab=home",
      est_minutes: 2,
    });
  }

  if (!f.linkedin_connected) {
    c.push({
      key: "connect_linkedin",
      title: "Connect LinkedIn",
      what: "Let Aura read how your posts actually performed.",
      why: fallbackWhy("connect_linkedin", f),
      how: "Open settings and connect your account. Nothing publishes without you.",
      outcome: "Drafts start being written from what your audience already rewards.",
      cta_route: "/dashboard?tab=settings",
      est_minutes: 3,
    });
  }

  if (f.facets_dormant.length > 0) {
    c.push({
      key: "fill_facet",
      title: `Fill the blank in ${f.facets_dormant[0]}`,
      what: "Add evidence for the part of your picture that is still empty.",
      why: fallbackWhy("fill_facet", f),
      how: "Capture something that shows that side of your work.",
      outcome: "Aura stops staying quiet where you are strongest but silent.",
      cta_route: "/dashboard?tab=identity",
      est_minutes: 5,
    });
  }

  return scrubMoves(c.slice(0, 3).map((m, i) => ({ rank: i + 1, ...m })), f);
}

// ──────────────────────────────────────────────────────── PHASE C: ADDRESS

const BANNED = [
  "the record shows", "the record indicates", "this suggests", "high volume of",
  "is not being converted", "your next step is", "it is worth noting", "in terms of",
  "leveraging", "massive", "disconnect", "trapped", "crucial", "vital", "stark",
  "glaring", "significant", "robust", "journey", "unlock", "elevate", "empower",
  "seamless", "authority", "trajectory", "personal brand", "thought leader",
  // register: a colleague speaking, not a campaign
  "mountain", "wealth of", "treasure", "goldmine", "release it", "your network",
  "put it out there", "get it out there", "share it with the world",
  // register: copywriter tells — state the situation, do not sell it
  "tipping point", "hoarding", "hoard", "the evidence is mounting", "at this stage",
  "put it into the world", "into the world", "picking up speed", "backlog of signals",
  "looks like hesitation", "the world is waiting", "your moment",
];

const OPENINGS = [
  "Open with a direct observation about where they actually stand.",
  "Open with a contrast — what is true on one side, what is true on the other.",
  "Open with a consequence: because of something they did or did not do, this follows.",
  "Open by naming something they did that you noticed.",
];

const SYSTEM_PROMPT = `You are Aura, this person's chief of staff. You have read their LinkedIn, their assessment, their calibration and everything they have captured. You write them one short address each morning. You sound like a sharp colleague who has already done the reading — never a coach, never a chatbot, never an analyst.

SUBSTANCE
Say one thing. An address is not a recap of the file. Pick the single most useful observation and build four to six sentences around it.
Three numbers maximum in the whole address, and a number earns its place only if it changes what they do today. Counts of fragments or sources change nothing; leave them out.
Name a specific thing, never a category. A named signal beats a count of signals.
Build on tension, not description. The shape is: here is what you have, here is what is missing, here is the decision. The tension is given to you in the input — use it, do not hunt for another.
Close on the decision, not the task. Your final sentence must point at the one move given to you as THE MOVE, by name, and at no other action — but say it in your own words. Never repeat the move's wording verbatim, and never phrase it as a list of steps.

SOUND
Vary sentence length deliberately. At least one sentence must be five words or fewer — a short, flat statement on its own line of thought. No sentence over thirty-two words. This short sentence is not optional; write it before you write anything else.
Second person, plain verbs, sentence case.
Never open with "You have". Never open with their name alone. Follow the opening instruction you are given.
No praise, no reassurance, no description of Aura's features, no exclamation marks, no emoji.
Never write a field name, a snake_case token, a dot-path, or a construction like "drafts_total is 6". Say "you have six drafts waiting" instead. Numbers belong inside English sentences, never beside the name of the place they came from.

REGISTER
State the situation. Do not dramatise it. A chief of staff does not tell a director that silence looks like hesitation; he says what is true and lets the director draw the conclusion. No accusation, no urgency theatre, no motivational close.

EVIDENCE — VERBATIM ONLY
You are given a short list of EVIDENCE PHRASES. They are written in code, they are correct, and each one already carries its own scope.
You must reproduce two or three of them VERBATIM — character for character, word for word. Do not reword, shorten, expand, pluralise or re-order the words inside a phrase.
You may place a phrase anywhere in a sentence and punctuate around it, and you may capitalise its first letter if it starts a sentence.
You may NOT attach a qualifier that narrows a phrase's subject — never add "on this theme", "on this topic", "on that signal", "on this transformation" or anything like it to a phrase that does not already contain it.
Every other word you write is connective tissue and must make no factual claim of its own: no figures, no dates, no counts, no claims about what they did or did not do beyond what a phrase already states.
You do not have the underlying data. If it is not in a phrase, you do not know it.
The address must still read as one continuous thought, not a list of clauses.

BANNED OUTRIGHT — these are analyst tells and must never appear:
${BANNED.join(" · ")}

EXAMPLES OF THE TARGET REGISTER (do not copy their content, only their sound):

Heavy reader who never publishes:
"You read more than anyone else on Aura this quarter. You've said almost none of it.
The signal on AI experimentation moving to enterprise value has been building since May, and there's still nothing of yours in public on it.
There's a draft from Tuesday that says it well enough.
Four days is long enough to think about it. Publish it, or kill it."

Day three, one capture:
"Three days in, and you've given me one thing to read.
Enough to start, not enough to be right about you. The theme I pulled from it — governance inside transformation programmes — may or may not be yours. I'd want two or three more before I'd stake a post on it.
Send me something today. Anything you'd have forwarded to a colleague."

Day one, nothing captured:
"I've read your LinkedIn and your assessment, so I know the shape of you: transformation, governance, the Gulf.
What I don't have is what you're reading right now — and that's the part that makes a post sound like you, rather than about you.
One link. That's the whole ask today."

Return plain markdown. No headings, no bullet lists, no preamble.`;

// ── number-word normalisation ──────────────────────────────────────────────
// A spelled-out number is a number. Everything downstream — the three-number
// limit and the traceability check — runs on the normalised string.

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const UNIT_RE = Object.keys(UNITS).join("|");
const TENS_RE = Object.keys(TENS).join("|");

// "one link", "one thing" — a determiner, not a quantity. Dropped before counting.
const GENERIC_ONE =
  /\bone\b(?=\s+(thing|link|line|note|post|idea|move|decision|question|sentence|paragraph|choice|answer|reason|place|side)\b)/gi;

/** Maps number words (incl. "forty-two", "two hundred") to digits. */
function normaliseNumbers(input: string): string {
  let t = input.replace(GENERIC_ONE, "a");

  // tens + unit, hyphenated or spaced: "forty-two" → 42
  t = t.replace(new RegExp(`\\b(${TENS_RE})[-\\s](one|two|three|four|five|six|seven|eight|nine)\\b`, "gi"),
    (_m, a: string, b: string) => String(TENS[a.toLowerCase()] + UNITS[b.toLowerCase()]));

  // scaled: "two hundred", "three thousand"
  t = t.replace(new RegExp(`\\b(${UNIT_RE})\\s+(hundred|thousand)\\b`, "gi"),
    (_m, a: string, s: string) => String(UNITS[a.toLowerCase()] * (s.toLowerCase() === "hundred" ? 100 : 1000)));
  t = t.replace(/\b(\d+)\s+(hundred|thousand)\b/gi,
    (_m, a: string, s: string) => String(parseInt(a, 10) * (s.toLowerCase() === "hundred" ? 100 : 1000)));
  t = t.replace(/\b(hundred|thousand)\b/gi, (_m, s: string) => (s.toLowerCase() === "hundred" ? "100" : "1000"));

  // bare tens and units
  t = t.replace(new RegExp(`\\b(${TENS_RE})\\b`, "gi"), (_m, a: string) => String(TENS[a.toLowerCase()]));
  t = t.replace(new RegExp(`\\b(${UNIT_RE})\\b`, "gi"), (_m, a: string) => String(UNITS[a.toLowerCase()]));

  return t;
}

function integersIn(text: string): number[] {
  return [...normaliseNumbers(text).matchAll(/\d+/g)].map((m) => parseInt(m[0], 10));
}

// ── fact phrases: correct by construction ──────────────────────────────────
// Each phrase is written in code from one fact, with its meaning attached.
// The model sees these and nothing else. It can never reach a bare number.

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function monthOf(isoDay: string | null): string | null {
  if (!isoDay) return null;
  const m = Number(isoDay.slice(5, 7));
  return m >= 1 && m <= 12 ? MONTHS[m - 1] : null;
}
const daysAgoFrom = (iso: string | null | undefined): number | null =>
  iso ? Math.max(0, daysBetween(new Date(), new Date(iso))) : null;

const WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const small = (n: number) => (n <= 10 ? WORD[n] : String(n));

function buildFactPhrases(f: Facts, move: Move | null): string[] {
  const p: string[] = [];
  const ts = f.top_signal;
  // A long theme title read twice makes the address sound stitched.
  const shortTitle = (t: string) => {
    const words = String(t).split(/\s+/);
    return words.length > 7 ? `${words.slice(0, 7).join(" ")}…` : String(t);
  };

  if (ts?.title) {
    const title = shortTitle(ts.title);
    const month = monthOf(ts.first_fragment_date);
    const n = ts.fragment_count ?? 0;
    if (n > 0 && month) p.push(`${n} fragments on "${title}" since ${month}`);
    else if (n > 0) p.push(`${n} fragments on "${title}"`);
    else p.push(`a theme called "${title}"`);
    if (ts.gained_last_7d) p.push(`new evidence for "${title}" arrived this week`);
    if (ts.velocity === "accelerating") p.push(`"${title}" is growing faster than anything else in your record`);
  }

  if ((f.signals_never_published_from ?? 0) > 0 && ts?.title) {
    p.push(`nothing published yet from "${shortTitle(ts.title)}"`);
  } else if ((f.signals_never_published_from ?? 0) > 0) {
    p.push(`${small(f.signals_never_published_from)} live themes you have never published from`);
  }

  const nsd = f.last_night?.newest_signal_draft;
  if (nsd?.title) p.push(`a draft already written on "${String(nsd.title).slice(0, 70)}"`);
  else if ((f.drafts_total ?? 0) > 0) p.push(`${small(f.drafts_total)} drafts written and unpublished`);

  const lastPub = daysAgoFrom(f.last_publish_attempt);
  if (lastPub != null) {
    p.push(lastPub === 0 ? `you published today` : `${small(lastPub)} days since you last pressed publish`);
  } else if ((f.published_total ?? 0) === 0 && (f.captures_total ?? 0) > 0) {
    p.push(`nothing of yours has gone out through Aura yet`);
  }

  const w = f.weeks_with_a_capture_last_4;
  if (typeof w === "number" && w < 4) {
    p.push(`${small(4 - w)} of your last four weeks had no capture of any kind`);
  } else if (w === 4) {
    p.push(`you captured something, on one subject or another, in each of the last four weeks`);
  }

  if (!f.captured_today && (f.captures_total ?? 0) > 0) p.push(`nothing new of any kind has come in today`);
  if ((f.captures_total ?? 0) === 0) p.push(`nothing captured yet, so nothing here sounds like you`);
  else if ((f.captures_this_week ?? 0) > 0) p.push(`${small(f.captures_this_week)} things captured this week across all subjects`);

  if ((f.facets_dormant?.length ?? 0) > 0) {
    p.push(`your ${String(f.facets_dormant[0]).replace(/_/g, " ")} has never registered in anything you have published`);
  }

  const sr = f.last_night?.sources_read ?? 0;
  if (sr > 0) p.push(`Aura read ${small(sr)} ${sr === 1 ? "source" : "sources"} for you overnight`);

  if (f.tier && f.next_band_name && f.points_to_next_band != null) {
    p.push(`${f.points_to_next_band} points between ${f.tier} and ${f.next_band_name}`);
  }

  if (f.linkedin_connected === false) p.push(`LinkedIn is not connected, so nothing comes back from your posts`);

  if (move?.key === "capture" && (f.captures_total ?? 0) > 0) p.push(`one link tonight would be enough to work from`);

  return p.slice(0, 10);
}

/** Every integer a phrase makes available to the writer. */
function integersInPhrases(phrases: string[]): Set<number> {
  const out = new Set<number>();
  phrases.forEach((s) => integersIn(s).forEach((n) => out.add(n)));
  return out;
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/[#*_`>]/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^A-Za-z0-9]/g, "").length > 0);
}

const wordsIn = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Day-of-year, so the opening rotates and never repeats within a week. */
function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function openingFor(userId: string, d: Date): string {
  return OPENINGS[(dayOfYear(d) + hashString(userId)) % OPENINGS.length];
}

/** The tension is computed here, never by the model. */
function computeTension(f: Facts, move: Move | null): { strength: string; gap: string } {
  if ((f.captures_total ?? 0) === 0) {
    return {
      strength: "Their profile and assessment already describe the shape of their work.",
      gap: "Nothing they are reading has reached Aura, so nothing here sounds like them yet.",
    };
  }
  if ((f.drafts_total ?? 0) > 0 && (f.published_through_aura ?? 0) === 0) {
    return {
      strength: "They have read enough for Aura to write from, and a draft is already written.",
      gap: "Nothing of theirs has gone out in public through Aura.",
    };
  }
  if (f.top_signal && (f.signals_never_published_from ?? 0) > 0) {
    return {
      strength: `Their strongest theme is "${f.top_signal.title}", and the evidence behind it keeps arriving.`,
      gap: "They have never published anything from it.",
    };
  }
  if (!f.captured_today) {
    return {
      strength: "There is a working record here and Aura reads it every night.",
      gap: "Nothing new has come in today, so tonight there is less to read.",
    };
  }
  return {
    strength: "The record is current and the themes are holding.",
    gap: `The next thing missing is ${move?.title ?? "a decision on what to say next"}.`,
  };
}

/** Keywords the closing sentence must touch for it to be about moves[0]. */
function moveAnchors(move: Move): string[] {
  const stop = new Set(["the", "a", "an", "into", "from", "your", "one", "that", "with", "this", "post", "turn", "on"]);
  const fromTitle = move.title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  const byKey: Record<string, string[]> = {
    publish_draft: ["publish", "draft", "post", "kill"],
    draft_from_signal: ["draft", "write", "post", "signal", "compose"],
    capture: ["capture", "send", "link", "read", "give"],
    connect_linkedin: ["connect", "linkedin"],
    fill_facet: ["capture", "fill", "evidence", "blank"],
  };
  return [...new Set([...(byKey[move.key] ?? []), ...fromTitle])];
}

type Gate = { pass: boolean; reasons: string[] };

/** Whitespace/quote-normalised, case-insensitive — "verbatim" up to typography. */
function canon(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Which of the supplied phrases appear verbatim inside the address. */
function phraseMatches(text: string, phrases: string[]): { matched: string[]; missed: string[] } {
  const hay = canon(text);
  const matched: string[] = [];
  const missed: string[] = [];
  for (const p of phrases) (hay.includes(canon(p)) ? matched : missed).push(p);
  return { matched, missed };
}

// A qualifier the model bolts on to narrow a phrase's subject. Allowed only in
// the exact number of times the supplied phrases already contain it.
const SCOPE_QUALIFIER =
  /\b(?:on|about|around|regarding) (?:this|that)(?: specific| very| particular| one)? (?:theme|topic|signal|subject|transformation|shift|thesis|idea|story|point|front|area|angle|thread|matter|question|issue|market|space|move|piece)\b/gi;

function gateAddress(text: string, phrases: string[], move: Move | null, memberName: string | null): Gate {
  const reasons: string[] = [];
  const lower = text.toLowerCase();
  const sents = sentencesOf(text);

  // The claims must be ours, not the model's. Verbatim or nothing.
  const { matched } = phraseMatches(text, phrases);
  if (phrases.length >= 2 && matched.length < 2) {
    reasons.push(`only ${matched.length} supplied phrase(s) reproduced verbatim (need 2)`);
  }

  const qualUsed = (text.match(SCOPE_QUALIFIER) ?? []).length;
  const qualAllowed = matched.reduce((n, p) => n + (p.match(SCOPE_QUALIFIER) ?? []).length, 0);
  if (qualUsed > qualAllowed) reasons.push("added a qualifier that narrows a phrase's subject");

  const ints = integersIn(text);
  if (ints.length > 3) reasons.push(`too many numbers (${ints.length})`);

  // The address must never read like software talking to itself.
  if (LEAK.test(text)) reasons.push("a field name or dot-path appears in the prose");

  // Strict: a number must come from a phrase we handed the model. Existing
  // somewhere in `facts` is not enough — a true number in a false sentence is
  // still a lie.
  const allowed = integersInPhrases(phrases);
  if (move) integersIn(`${move.title} ${move.what}`).forEach((n) => allowed.add(n));
  const unknown = ints.filter((n) => !allowed.has(n));
  if (unknown.length) reasons.push(`number not in any supplied phrase: ${unknown.join(", ")}`);

  if (!sents.some((s) => wordsIn(s) < 8)) reasons.push("no sentence under 8 words");
  const longest = sents.find((s) => wordsIn(s) > 32);
  if (longest) reasons.push("a sentence exceeds 32 words");
  if (sents.length < 3 || sents.length > 7) reasons.push(`sentence count is ${sents.length}`);

  const opener = sents[0] ?? "";
  if (/^you have\b/i.test(opener.trim())) reasons.push('opens with "You have"');
  if (memberName && new RegExp(`^${memberName.split(/\s+/)[0]}\\b[,.\\s]`, "i").test(opener.trim())) {
    reasons.push("opens with the member's name");
  }

  const hits = BANNED.filter((b) => lower.includes(b));
  if (hits.length) reasons.push(`banned term: ${hits.join(", ")}`);

  if (move) {
    const closing = (sents[sents.length - 1] ?? "").toLowerCase();
    const tail = sents.slice(-2).join(" ").toLowerCase();
    const anchors = moveAnchors(move);
    if (!anchors.some((a) => closing.includes(a) || tail.includes(a))) {
      reasons.push("closing sentence does not name the move");
    }
  }

  return { pass: reasons.length === 0, reasons };
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The plain sentence that names today's decision, in the member's language. */
function decisionSentence(move: Move | null): string {
  if (!move) return `The decision today is simple: send me one thing you read.`;
  const byKey: Record<string, string> = {
    publish_draft: `The decision today is whether that draft goes out or gets killed.`,
    draft_from_signal: `The decision today is whether you write from it.`,
    capture: `The decision today is to send me one thing you read.`,
    connect_linkedin: `The decision today is to connect LinkedIn so your posts report back.`,
    fill_facet: `The decision today is which of those blanks you fill first.`,
  };
  return byKey[move.key] ?? `The decision today is ${move.title.charAt(0).toLowerCase()}${move.title.slice(1)}.`;
}

/**
 * Read by a member on the days the model misbehaves, so it is assembled from
 * the same construction-correct phrases the model would have been given.
 */
function fallbackAddress(f: Facts, move: Move | null, phrases: string[]): string {
  if ((f.captures_total ?? 0) === 0) {
    return `I know the shape of your work from your profile and your assessment. What I do not have is what you are reading right now, and that is the part that makes a post sound like you. One link is enough. Send me something today.`;
  }
  const [a, b] = phrases;
  if (!a) return decisionSentence(move);
  if (!b) return `${upperFirst(a)}. ${decisionSentence(move)}`;
  return `${upperFirst(a)}. ${upperFirst(b)}. ${decisionSentence(move)}`;
}

async function callModel(apiKey: string, userMsg: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

async function writeAddress(
  apiKey: string, facts: Facts, lens: string, lensReason: string,
  move: Move | null, userId: string, memberName: string | null,
): Promise<{ text: string; model: string | null; quality: Record<string, unknown>; phrases: string[] }> {
  const lensBrief = {
    record: "Focus on what they have built and what the record now shows.",
    room: "Focus on the conversation happening now and where they should stand in it.",
    shape: "Focus on the shape of what they are building and the next piece it needs.",
  }[lens] ?? "";

  const tension = computeTension(facts, move);
  const phrases = buildFactPhrases(facts, move);

  const base = `Lens: ${lens}. ${lensBrief}
Reason for the lens (already shown to them, do not repeat it verbatim): ${lensReason}

Opening instruction for today: ${openingFor(userId, new Date())}

Tension (use this, do not look for another):
- strength: ${tension.strength}
- gap: ${tension.gap}

THE MOVE — your closing sentence must point at this and nothing else:
${move ? `${move.title} — ${move.what}` : "No move is available; close on capturing one thing they read today."}

EVIDENCE PHRASES — reproduce two or three of these VERBATIM, character for character. They are the only facts and the only figures you have, and each already carries its own scope:
${phrases.map((s) => `- ${s}`).join("\n") || "- (no evidence yet)"}`;

  const attempts: Array<{ attempt: number; reasons: string[] }> = [];

  for (let i = 0; i < 2; i++) {
    let text = "";
    try {
      text = await callModel(apiKey, i === 0 ? base : `${base}

Your previous attempt was rejected for: ${attempts[0].reasons.join("; ")}. Write it again and fix every one of those.
Hard requirements on this second attempt: copy at least two of the evidence phrases above letter for letter, and include one sentence of five words or fewer.`);
    } catch (e) {
      attempts.push({ attempt: i + 1, reasons: [`gateway error: ${(e as Error)?.message}`] });
      break;
    }
    if (!text) {
      attempts.push({ attempt: i + 1, reasons: ["empty response"] });
      continue;
    }
    const g = gateAddress(text, phrases, move, memberName);
    if (g.pass) {
      const { matched, missed } = phraseMatches(text, phrases);
      return {
        text,
        model: MODEL,
        phrases,
        quality: {
          passed: true, attempt: i + 1, failed_attempts: attempts,
          phrases, phrases_matched: matched, phrases_unused: missed,
          checked_at: new Date().toISOString(),
        },
      };
    }
    attempts.push({ attempt: i + 1, reasons: g.reasons });
  }

  return {
    text: fallbackAddress(facts, move, phrases),
    model: null,
    phrases,
    quality: { passed: false, fallback: true, failed_attempts: attempts, phrases, checked_at: new Date().toISOString() },
  };
}

// ───────────────────────────────────────────────────────────── GENERATION

async function generateFor(
  admin: SupabaseClient, apiKey: string, userId: string, force: boolean,
) {
  const today = dayKey(new Date());

  if (!force) {
    const { data: existing } = await admin.from("home_address")
      .select("*").eq("user_id", userId).eq("address_date", today).maybeSingle();
    if (existing) return { row: existing, cached: true, rejected: false };
  }

  const facts = await gatherFacts(admin, userId);
  const { lens, lens_reason } = chooseLens(facts);
  const moves = chooseMoves(facts);
  const { data: prof } = await admin.from("diagnostic_profiles")
    .select("first_name").eq("user_id", userId).maybeSingle();
  const memberName = (prof as any)?.first_name ?? null;

  const { text, model, quality, phrases } = await writeAddress(
    apiKey, facts, lens, lens_reason, moves[0] ?? null, userId, memberName,
  );
  const rejected = quality.passed !== true;

  if (rejected) {
    await logEfError(admin, {
      function_name: FN,
      error: "address failed the quality gate twice — deterministic fallback stored",
      severity: "info",
      user_id: userId,
      context: { lens, quality },
    });
  }

  const { data: row, error } = await admin.from("home_address").upsert({
    user_id: userId,
    address_date: today,
    lens,
    lens_reason,
    address_md: text,
    moves,
    // The evidence trail must be auditable after the fact, not only in memory.
    facts: { ...facts, fact_phrases: phrases },
    model,
    quality,
    generated_at: new Date().toISOString(),
  }, { onConflict: "user_id,address_date" }).select().maybeSingle();
  if (error) throw error;

  return { row, cached: false, rejected };
}

// ──────────────────────────────────────────────────────────────── HANDLER

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* empty body is fine */ }
    const force = body?.force === true;

    // Vault secret name is LOWERCASE `cron_secret`.
    const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
    const isCron = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;

    if (isCron) {
      const since = isoDaysAgo(30);
      const { data: recent } = await admin.from("diagnostic_profiles")
        .select("user_id, last_visit_at, last_active_at")
        .or(`last_visit_at.gte.${since},last_active_at.gte.${since}`)
        .limit(2000);
      const ids = [...new Set((recent ?? []).map((r: any) => r.user_id))];

      let ok = 0, failed = 0, rejected = 0;
      for (const id of ids) {
        try {
          const r = await generateFor(admin, apiKey, id, true);
          ok++;
          if (r.rejected) rejected++;
        } catch (e) {
          failed++;
          await logEfError(admin, { function_name: FN, error: e, severity: "high", user_id: id });
        }
      }
      await logEfError(admin, {
        function_name: FN,
        error: `cron run complete: ${ok} generated, ${failed} failed, ${rejected} fallbacks`,
        severity: "info",
        context: { mode: "cron", eligible: ids.length, ok, failed, rejected },
      });
      return json({ ok: true, mode: "cron", eligible: ids.length, generated: ok, failed, rejected });
    }

    // User-invoked path — requires the caller's JWT.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: authData, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !authData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const userId = authData.user.id;

    const { row, cached, rejected } = await generateFor(admin, apiKey, userId, force);
    await logEfError(admin, {
      function_name: FN,
      error: cached ? "served cached address" : "generated address",
      severity: "info",
      user_id: userId,
      context: { mode: "user", cached, rejected, lens: (row as any)?.lens },
    });
    return json({ ok: true, cached, address: row });
  } catch (e) {
    console.error(`[${FN}]`, e);
    await logEfError(admin, { function_name: FN, error: e, severity: "high" });
    return json({ error: (e as Error)?.message ?? "Unknown error" }, 500);
  }
});