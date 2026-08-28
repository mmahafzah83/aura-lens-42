/**
 * learn-from-sessions — the Desk learns from WORKING with him, nothing else.
 *
 * THE DISCIPLINE (Q2). This function is the easiest place in the product for
 * confident invention to return dressed as insight, so it is deliberately dumb:
 *
 *  - Every observation is a COUNT with the evidence ids behind it. Never an
 *    adjective, never a motive, never a mood, never a personality reading.
 *  - Minimum three occurrences before a row is written at all; five or more
 *    makes it `strong`.
 *  - Only five kinds may ever be learned: asks_about, acts_on, rejects,
 *    talks_like, corrects.
 *  - A dismissed observation is never re-learned.
 *  - Counts are recomputed each run; an observation unseen for 60 days decays
 *    to `observed`, and at 90 days with no new evidence it is deleted. Stale
 *    learning is worse than none — it describes someone he no longer is.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** The only kinds that exist. Nothing else may be written. */
type Kind = "asks_about" | "acts_on" | "rejects" | "talks_like" | "corrects";

const MIN_EVIDENCE = 3;   // below this, nothing is written at all
const STRONG_AT = 5;      // at or above this, the row is `strong`
const DECAY_DAYS = 60;    // unseen this long → back to `observed`
const DELETE_DAYS = 90;   // unseen this long → deleted
const WINDOW_DAYS = 30;   // the reading window

interface Candidate {
  kind: Kind;
  observation: string;
  count: number;
  evidence: Record<string, unknown>;
}

/**
 * Question intents. A fixed, countable vocabulary — the clustering does not
 * need to be clever, it needs to be true.
 */
const INTENTS: { key: string; label: string; re: RegExp }[] = [
  { key: "score", label: "your score and where you stand", re: /\b(score|where i stand|standing|my number|rank|band)\b/i },
  { key: "signals", label: "your signals", re: /\b(signal|signals|إشارة|إشارات|trend|intel|competitor)\b/i },
  { key: "writing", label: "what to write and drafting", re: /\b(draft|write|post about|what should i write|rewrite|sharper|مسودة|اكتب)\b/i },
  { key: "performance", label: "how your posts performed", re: /\b(engagement|impressions|reach|performed|performance|audience|followers)\b/i },
  { key: "record", label: "your captures and documents", re: /\b(capture|captures|document|documents|vault|evidence|file|pdf)\b/i },
  { key: "profile", label: "your LinkedIn profile", re: /\b(profile|headline|about section|linkedin)\b/i },
  { key: "gaps", label: "your gaps and capabilities", re: /\b(gap|gaps|capability|capabilities|partner level|skills?)\b/i },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** He told the Desk it was wrong. Counted, never interpreted. */
const CORRECTION = /\b(that'?s (not right|wrong|incorrect)|not true|you'?re wrong|that is wrong|wrong number|incorrect|actually,? (it|i)\b|no,? it'?s)\b/i;

function arabicShare(text: string): number {
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const la = (text.match(/[A-Za-z]/g) || []).length;
  return ar + la === 0 ? 0 : ar / (ar + la);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isService = authHeader === `Bearer ${SERVICE_ROLE}` ||
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let userIds: string[] = [];
    if (isService) {
      if (typeof body.user_id === "string") {
        userIds = [body.user_id];
      } else {
        // Nightly: everyone who spoke to the Desk inside the window.
        const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
        const { data } = await admin
          .from("aura_conversation_memory").select("user_id").gte("created_at", since).limit(5000);
        userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
      }
    } else {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "").trim();
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error } = await anon.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      userIds = [user.id];
    }

    const results: Record<string, unknown>[] = [];
    for (const userId of userIds) {
      results.push(await learnForUser(admin, userId));
    }

    return json({ ok: true, users: userIds.length, results });
  } catch (e) {
    console.error("learn-from-sessions failed", (e as Error)?.message);
    return json({ error: (e as Error)?.message ?? "failed" }, 500);
  }
});


async function learnForUser(admin: any, userId: string) {
  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const candidates: Candidate[] = [];

  // ── his messages to the Desk ────────────────────────────────────────────
  const { data: msgs } = await admin
    .from("aura_conversation_memory")
    .select("id, content, summary, role, created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(500);

  const userMsgs = (msgs || [])
    .map((m: any) => ({ id: m.id, text: String(m.content ?? m.summary ?? ""), at: String(m.created_at ?? "") }))
    .filter((m: any) => m.text.trim().length > 2);

  // asks_about — recurring question intent, counted.
  for (const intent of INTENTS) {
    const hits = userMsgs.filter((m: any) => intent.re.test(m.text));
    if (hits.length < MIN_EVIDENCE) continue;
    const dayCounts = new Array(7).fill(0);
    for (const h of hits) {
      const d = new Date(h.at);
      if (!isNaN(d.getTime())) dayCounts[d.getUTCDay()] += 1;
    }
    const top = dayCounts.indexOf(Math.max(...dayCounts));
    const dayClause = dayCounts[top] >= Math.ceil(hits.length / 2) && dayCounts[top] >= MIN_EVIDENCE
      ? ` ${dayCounts[top]} of those fell on a ${WEEKDAYS[top]}.`
      : "";
    candidates.push({
      kind: "asks_about",
      observation: `You have asked about ${intent.label} ${hits.length} times in the last ${WINDOW_DAYS} days.${dayClause}`,
      count: hits.length,
      evidence: {
        intent: intent.key,
        message_ids: hits.slice(0, 20).map((h: any) => h.id),
        dates: hits.slice(0, 20).map((h: any) => h.at.slice(0, 10)),
      },
    });
  }

  // talks_like — countable properties of HIS messages, never of him.
  if (userMsgs.length >= MIN_EVIDENCE) {
    const words = userMsgs.map((m: any) => m.text.trim().split(/\s+/).length);
    const avg = Math.round(words.reduce((a: number, b: number) => a + b, 0) / words.length);
    const arabic = userMsgs.filter((m: any) => arabicShare(m.text) > 0.2).length;
    candidates.push({
      kind: "talks_like",
      observation: `Your last ${userMsgs.length} messages to the Desk average ${avg} words each.`,
      count: userMsgs.length,
      evidence: { average_words: avg, message_ids: userMsgs.slice(0, 20).map((m: any) => m.id) },
    });
    if (arabic >= MIN_EVIDENCE) {
      candidates.push({
        kind: "talks_like",
        observation: `${arabic} of your last ${userMsgs.length} messages to the Desk were written in Arabic.`,
        count: arabic,
        evidence: {
          arabic_messages: arabic, total_messages: userMsgs.length,
          message_ids: userMsgs.filter((m: any) => arabicShare(m.text) > 0.2).slice(0, 20).map((m: any) => m.id),
        },
      });
    }
  }

  // corrects — he told the Desk it was wrong. Highest value; never overwritten.
  const corrections = userMsgs.filter((m: any) => CORRECTION.test(m.text));
  if (corrections.length >= MIN_EVIDENCE) {
    candidates.push({
      kind: "corrects",
      observation: `You have told the Desk it was wrong ${corrections.length} times in the last ${WINDOW_DAYS} days.`,
      count: corrections.length,
      evidence: {
        message_ids: corrections.slice(0, 20).map((c: any) => c.id),
        dates: corrections.slice(0, 20).map((c: any) => c.at.slice(0, 10)),
        quotes: corrections.slice(0, 5).map((c: any) => c.text.slice(0, 160)),
      },
    });
  }

  // ── acts_on — moves offered against moves taken. Behaviour, not opinion. ──
  const { data: evs } = await admin
    .from("product_events")
    .select("event, props, occurred_at")
    .eq("user_id", userId)
    .in("event", ["desk_move_offered", "desk_move_taken"])
    .gte("occurred_at", sinceISO)
    .limit(5000);

  const offered = new Map<string, number>();
  const taken = new Map<string, number>();
  for (const e of evs || []) {
    const label = String((e as any)?.props?.label ?? "").trim().slice(0, 60);
    if (!label) continue;
    const m = (e as any).event === "desk_move_offered" ? offered : taken;
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  for (const [label, offers] of offered) {
    if (offers < MIN_EVIDENCE) continue;
    const took = taken.get(label) ?? 0;
    candidates.push({
      kind: "acts_on",
      observation: took === 0
        ? `You were offered "${label}" ${offers} times and have never taken it.`
        : `You were offered "${label}" ${offers} times and took it ${took} times.`,
      count: offers,
      evidence: { label, offered: offers, taken: took },
    });
  }

  // ── rejects — refusals he made explicitly. ───────────────────────────────
  const { data: prof } = await admin
    .from("diagnostic_profiles").select("desk_prefs").eq("user_id", userId).maybeSingle();
  const prefs: any = (prof as any)?.desk_prefs && typeof (prof as any).desk_prefs === "object"
    ? (prof as any).desk_prefs : {};

  const dismissedMirror: string[] = Array.isArray(prefs.mirror_dismissed) ? prefs.mirror_dismissed : [];
  if (dismissedMirror.length >= MIN_EVIDENCE) {
    candidates.push({
      kind: "rejects",
      observation: `You have marked ${dismissedMirror.length} Mirror lines as not true.`,
      count: dismissedMirror.length,
      evidence: { signatures: dismissedMirror.slice(0, 20) },
    });
  }

  const declined = prefs.declined && typeof prefs.declined === "object" ? Object.entries(prefs.declined) : [];
  if (declined.length >= MIN_EVIDENCE) {
    candidates.push({
      kind: "rejects",
      observation: `You have pushed back ${declined.length} requests for something the Desk asked you to add.`,
      count: declined.length,
      evidence: { declined: Object.fromEntries(declined) },
    });
  }

  const { data: fb } = await admin
    .from("desk_answer_feedback")
    .select("id, question, created_at")
    .eq("user_id", userId)
    .eq("verdict", "no")
    .gte("created_at", sinceISO)
    .limit(500);
  if ((fb || []).length >= MIN_EVIDENCE) {
    candidates.push({
      kind: "rejects",
      observation: `You have marked ${(fb || []).length} Desk answers as wrong in the last ${WINDOW_DAYS} days.`,
      count: (fb || []).length,
      evidence: {
        feedback_ids: (fb || []).slice(0, 20).map((r: any) => r.id),
        dates: (fb || []).slice(0, 20).map((r: any) => String(r.created_at).slice(0, 10)),
      },
    });
  }

  // ── write: recompute counts, respect dismissals, never touch `corrects` ──
  const { data: existingRows } = await admin
    .from("desk_learning").select("id, kind, observation, dismissed, evidence_count").eq("user_id", userId);
  const existing = new Map<string, any>();
  for (const r of existingRows || []) existing.set(`${r.kind}::${r.observation}`, r);

  const now = new Date().toISOString();
  const written: Candidate[] = [];
  let skippedDismissed = 0;
  let skippedThin = 0;

  for (const c of candidates) {
    if (c.count < MIN_EVIDENCE) { skippedThin += 1; continue; }
    const prior = existing.get(`${c.kind}::${c.observation}`);
    if (prior?.dismissed) { skippedDismissed += 1; continue; }   // never re-learned
    if (prior && c.kind === "corrects") { written.push(c); continue; } // never overwritten

    const row = {
      user_id: userId,
      kind: c.kind,
      observation: c.observation,
      evidence_count: c.count,
      evidence: c.evidence,
      confidence: c.count >= STRONG_AT ? "strong" : "observed",
      last_seen: now,
      updated_at: now,
    };
    if (prior) {
      await admin.from("desk_learning").update(row).eq("id", prior.id);
    } else {
      await admin.from("desk_learning").insert({ ...row, first_seen: now });
    }
    written.push(c);
  }

  // Decay, then delete. Stale learning is worse than none.
  const decayCut = new Date(Date.now() - DECAY_DAYS * 86_400_000).toISOString();
  const deleteCut = new Date(Date.now() - DELETE_DAYS * 86_400_000).toISOString();
  const { data: decayed } = await admin
    .from("desk_learning").update({ confidence: "observed" })
    .eq("user_id", userId).eq("confidence", "strong").lt("last_seen", decayCut).select("id");
  const { data: deleted } = await admin
    .from("desk_learning").delete()
    .eq("user_id", userId).lt("last_seen", deleteCut).select("id");

  return {
    user_id: userId,
    messages_read: userMsgs.length,
    candidates: candidates.length,
    written: written.length,
    skipped_below_minimum: skippedThin,
    skipped_dismissed: skippedDismissed,
    decayed: (decayed || []).length,
    deleted: (deleted || []).length,
    observations: written.map((w) => ({ kind: w.kind, observation: w.observation, count: w.count, evidence: w.evidence })),
  };
}
