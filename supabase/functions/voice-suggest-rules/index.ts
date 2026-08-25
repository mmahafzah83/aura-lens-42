/**
 * Propose writing rules from the member's own posts — never from generic
 * writing advice.
 *
 * Two passes. The first counts patterns and can always show its working. The
 * second asks a model for the things counting cannot express (recurring
 * stances, themes) and DISCARDS anything that does not cite post ids.
 *
 * Everything written here lands as `status = 'suggested'`. A suggestion is a
 * proposal: it does not reach the generator until the member accepts it.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAdmin } from "../_shared/adminRole.ts";
import { isOwnWriting, CORPUS_COLUMNS } from "../_shared/voiceCorpus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** A wall of proposals is not a gift. */
const MAX_SUGGESTIONS = 6;
const DISMISSAL_MEMORY_DAYS = 90;
/** A phrase must appear in this share of posts to be worth naming. */
const PHRASE_SHARE = 0.4;
/** A structural habit must be this consistent before Aura calls it a rule. */
const HABIT_SHARE = 0.6;
const MIN_POSTS = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Kind = "always" | "never" | "anchor";

interface RuleCheck { kind: "phrase" | "opening" | "ending" | "marker"; value: string }
interface Candidate {
  kind: Kind;
  text: string;
  evidence: { post_ids: string[]; count: number; total: number; note: string };
  derivation: "rule" | "model";
  sourceKey: SourceKey;
  check: RuleCheck | null;
}
type SourceKey = "openings" | "endings" | "phrases" | "structure" | "absences";
const ALL_SOURCES: SourceKey[] = ["openings", "endings", "phrases", "structure", "absences"];

/** Comparison form: case, punctuation and spacing carry no meaning here. */
const normalise = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

const sentences = (t: string) => t.split(/(?<=[.!?؟])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

const PRESCRIPTION = /\b(?:instead|must be|should be)\b|;\s*success must|(?:^|\s)(?:بل|وإنما)(?:\s|$)/iu;
const DOUBLE_NEGATIVE = /^(?:never|do not|don't)\s+(?:ignore|omit|forget|overlook|fail to)\b/i;

/** One instruction, one behaviour. Never rules must be defensible and checkable. */
export function validateCandidate(candidate: Candidate): Candidate | null {
  const text = candidate.text.replace(/\s+/g, " ").trim();
  if (!text || sentences(text).length > 1 || /;/.test(text)) return null;
  if (candidate.kind !== "never") return { ...candidate, text };
  if (DOUBLE_NEGATIVE.test(text) || PRESCRIPTION.test(text)) {
    const positive = text
      .replace(/^(?:never|do not|don't)\s+(?:ignore|omit|forget|overlook)\s+/i, "Always address ")
      .replace(/^(?:never|do not|don't)\s+fail to\s+/i, "Always ");
    return positive === text ? null : { ...candidate, kind: "always", text: positive, check: null };
  }
  // A Never without a deterministic test is guidance, not a mechanically
  // enforced Never. Quoted text is the only model inference safe to turn into
  // a phrase test; deterministic probes already supply their own typed check.
  if (!candidate.check) {
    const quote = text.match(/["“«']([^"”»']{2,100})["”»']/)?.[1]?.trim();
    candidate = { ...candidate, check: quote ? { kind: "phrase", value: quote } : null };
  }
  return { ...candidate, text };
}

interface Post { id: string; text: string }

/* ── pass 1: things that can be counted ──────────────────────────────────── */

function deterministic(posts: Post[], sources: Set<SourceKey>): Candidate[] {
  const total = posts.length;
  const out: Candidate[] = [];
  const hit = (kind: Kind, text: string, matched: Post[], note: string, sourceKey: SourceKey, check: RuleCheck | null = null) =>
    out.push({ kind, text, derivation: "rule", sourceKey, check,
      evidence: { post_ids: matched.slice(0, 40).map((p) => p.id), count: matched.length, total, note } });

  /* recurring phrases — 3-word windows carried across posts */
  const phrasePosts = new Map<string, Set<string>>();
  for (const p of posts) {
    const words = normalise(p.text).split(" ").filter((w) => w.length > 2);
    const seen = new Set<string>();
    for (let i = 0; i + 2 < words.length; i++) {
      const gram = words.slice(i, i + 3).join(" ");
      if (seen.has(gram)) continue;
      seen.add(gram);
      if (!phrasePosts.has(gram)) phrasePosts.set(gram, new Set());
      phrasePosts.get(gram)!.add(p.id);
    }
  }
  const phrases = [...phrasePosts.entries()]
    .filter(([, ids]) => ids.size / total >= PHRASE_SHARE && ids.size >= 3)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 2);
  for (const [gram, ids] of sources.has("phrases") ? phrases : []) {
    const matched = posts.filter((p) => ids.has(p.id));
    hit("anchor", `Keep the phrase "${gram}" — it runs through your writing.`, matched,
      `In ${ids.size} of your ${total} posts`, "phrases");
  }

  /* structural habits */
  const firstLine = (t: string) => t.split(/\n/)[0] ?? "";
  const lastLine = (t: string) => {
    const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] ?? "";
  };

  const numberOpeners = posts.filter((p) => /[\d٠-٩]/.test(firstLine(p.text)));
  if (sources.has("openings") && numberOpeners.length / total >= HABIT_SHARE) {
    hit("always", "Open with a number or a figure — that is how you start.", numberOpeners,
      `In ${numberOpeners.length} of your ${total} posts`, "openings");
  }

  const questionEnders = posts.filter((p) => /[?؟]\s*$/.test(lastLine(p.text)));
  if (sources.has("endings") && questionEnders.length / total >= HABIT_SHARE) {
    hit("always", "End on a question, not a summary.", questionEnders,
      `In ${questionEnders.length} of your ${total} posts`, "endings");
  }

  const shortParas = posts.filter((p) => {
    const paras = p.text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    if (paras.length < 2) return false;
    return paras.filter((x) => sentences(x).length <= 2).length / paras.length >= 0.8;
  });
  if (sources.has("structure") && shortParas.length / total >= HABIT_SHARE) {
    hit("always", "Keep paragraphs to one or two sentences.", shortParas,
      `In ${shortParas.length} of your ${total} posts`, "structure");
  }

  /* absences — generic LinkedIn habits the member has never once used */
  const ABSENT: { probe: RegExp; text: string; check: RuleCheck }[] = [
    { probe: /what (are|do) your thoughts|let me know in the comments|thoughts\?\s*$/i,
      text: `Never close with "What are your thoughts?"`, check: { kind: "ending", value: "What are your thoughts?" } },
    { probe: /(^|\n)\s*(✅|✔️|☑️)/,
      text: "Never use a checkmark list.", check: { kind: "marker", value: "✅" } },
    { probe: /(^|\n)\s*(🚀|💡|🔥)/,
      text: "Never open with a motivational emoji.", check: { kind: "opening", value: "🚀" } },
    { probe: /(#\w+[^\n]*){3,}/,
      text: "Never end with a block of hashtags.", check: { kind: "marker", value: "###" } },
  ];
  for (const a of sources.has("absences") ? ABSENT : []) {
    const used = posts.filter((p) => a.probe.test(p.text));
    if (used.length === 0) {
      hit("never", a.text, [], "Never appears in your writing", "absences", a.check);
    }
  }

  return out;
}

/* ── pass 2: the model, evidence required ────────────────────────────────── */

async function modelPass(posts: Post[], apiKey: string): Promise<Candidate[]> {
  const sample = posts.slice(0, 25);
  const corpus = sample
    .map((p) => `<post id="${p.id}">\n${p.text.slice(0, 1200)}\n</post>`)
    .join("\n\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You read one person's LinkedIn posts and name recurring themes, stances and value statements that a word-counter cannot see. " +
            "Return at most 4 rules. Every rule MUST cite the ids of the posts it came from. Never invent generic writing advice. " +
            "Never propose a rule you cannot evidence from at least three of the supplied posts. " +
            'Reply as JSON only: {"rules":[{"kind":"always|never|anchor","text":"...","post_ids":["..."]}]}',
        },
        { role: "user", content: corpus },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("voice-suggest-rules gateway error", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  let parsed: { rules?: { kind?: string; text?: string; post_ids?: string[] }[] } = {};
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return [];
  }

  const valid = new Set(sample.map((p) => p.id));
  const out: Candidate[] = [];
  for (const r of parsed.rules ?? []) {
    const kind = (r.kind === "never" || r.kind === "anchor" ? r.kind : "always") as Kind;
    const text = String(r.text || "").trim();
    const ids = (r.post_ids ?? []).map(String).filter((id) => valid.has(id));
    // No evidence, no suggestion. This is the rule that keeps the page honest.
    if (!text || ids.length < 3) continue;
    out.push({
      kind, text, derivation: "model", sourceKey: "structure", check: null,
      evidence: { post_ids: ids, count: ids.length, total: posts.length, note: `In ${ids.length} of your ${posts.length} posts` },
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const requested = Array.isArray(body.sources) ? body.sources.map(String) : ALL_SOURCES;
    const sources = new Set<SourceKey>(requested.filter((s): s is SourceKey => ALL_SOURCES.includes(s as SourceKey)));
    if (sources.size === 0) return json({ error: "Choose at least one source" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader === `Bearer ${SERVICE_ROLE}`;

    let userId: string | null = null;
    if (isService) {
      userId = typeof body.user_id === "string" ? body.user_id : null;
      if (!userId) return json({ error: "user_id required for a service call" }, 400);
    } else {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !data?.claims) return json({ error: "Unauthorized" }, 401);
      const caller = data.claims.sub as string;
      const asked = typeof body.user_id === "string" ? body.user_id : null;
      // Only an admin may look at somebody else's writing.
      userId = asked && (await isAdmin(anon, caller)) ? asked : caller;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: postRows, error: postErr } = await admin
      .from("linkedin_posts")
      .select(`id, ${CORPUS_COLUMNS}`)
      .eq("user_id", userId)
      .not("post_text", "is", null)
      .limit(500);
    if (postErr) throw new Error(postErr.message);

    const posts: Post[] = (postRows ?? [])
      .filter(isOwnWriting)
      .filter((r) => String(r.voice_corpus_status ?? "included") === "included")
      .map((r) => ({ id: String(r.id), text: String(r.post_text ?? "").trim() }))
      .filter((p) => p.text.length > 0);

    if (posts.length < MIN_POSTS) {
      return json({ user_id: userId, written: 0, reason: `only ${posts.length} included posts`, by_kind: {}, rule_derived: 0, model_derived: 0 });
    }

    /* what already exists — never duplicate, never re-suggest a recent dismissal */
    const { data: existing } = await admin
      .from("voice_rules")
      .select("text, kind, status, decided_at")
      .eq("user_id", userId);

    const cutoff = Date.now() - DISMISSAL_MEMORY_DAYS * 86_400_000;
    const blocked: { kind: Kind; text: string }[] = [];
    for (const r of existing ?? []) {
      const key = normalise(String(r.text ?? ""));
      if (!key) continue;
      if (r.status === "active" || r.status === "suggested") blocked.push({ kind: r.kind as Kind, text: key });
      if (r.status === "dismissed") {
        const at = r.decided_at ? new Date(r.decided_at as string).getTime() : 0;
        if (at >= cutoff) blocked.push({ kind: r.kind as Kind, text: key });
      }
    }

    const ruleCandidates = deterministic(posts, sources).map(validateCandidate).filter((c): c is Candidate => Boolean(c));
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const modelCandidates = apiKey && (sources.has("openings") || sources.has("structure"))
      ? (await modelPass(posts, apiKey)).map(validateCandidate).filter((c): c is Candidate => Boolean(c))
      : [];

    const chosen: Candidate[] = [];
    for (const c of [...ruleCandidates, ...modelCandidates]) {
      const key = normalise(c.text);
      const tokens = new Set(key.split(" ").filter(Boolean));
      const near = blocked.some((b) => {
        if (b.kind !== c.kind) return false;
        const other = new Set(b.text.split(" ").filter(Boolean));
        const overlap = [...tokens].filter((token) => other.has(token)).length;
        return overlap / Math.max(1, Math.min(tokens.size, other.size)) >= 0.7;
      });
      if (near) continue;
      blocked.push({ kind: c.kind, text: key });
      chosen.push(c);
      if (chosen.length >= MAX_SUGGESTIONS) break;
    }

    if (chosen.length > 0) {
      const now = new Date().toISOString();
      const { error: insErr } = await admin.from("voice_rules").insert(
        chosen.map((c, i) => ({
          user_id: userId,
          kind: c.kind,
          text: c.text,
          source: "aura",
          status: "suggested",
          active: true,
          rank: 1000 + i,
          suggested_at: now,
          evidence: { ...c.evidence, derivation: c.derivation, source: c.sourceKey },
          check: c.kind === "never" ? c.check : null,
        })),
      );
      if (insErr) throw new Error(insErr.message);
    }

    const byKind: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const c of chosen) { byKind[c.kind] = (byKind[c.kind] ?? 0) + 1; bySource[c.sourceKey] = (bySource[c.sourceKey] ?? 0) + 1; }

    return json({
      user_id: userId,
      posts_read: posts.length,
      written: chosen.length,
      by_kind: byKind,
      sources_run: [...sources],
      by_source: bySource,
      rule_derived: chosen.filter((c) => c.derivation === "rule").length,
      model_derived: chosen.filter((c) => c.derivation === "model").length,
      suggestions: chosen.map((c) => ({ kind: c.kind, text: c.text, evidence: c.evidence.note, derivation: c.derivation })),
    });
  } catch (error) {
    console.error("voice-suggest-rules error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
