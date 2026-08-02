/**
 * Teach the voice profile from the member's own posts.
 *
 * Only text the member actually published counts: the official LinkedIn data
 * export, posts captured from their own activity page, and posts published
 * through Aura. Posts are split by script, and each language updates its own
 * `authority_voice_profiles` row.
 *
 * This function only ever ADDS. A human-curated `avoid` list is never touched,
 * and curated `use` phrases are never removed.
 */
import { scriptOf } from "./linkedinPost.ts";

const OWN_SOURCES = ["linkedin_export", "linkedin_own", "aura_generated"];
const MAX_EXAMPLES = 20;

interface PostRow {
  post_text: string | null;
  post_url: string | null;
  published_at: string | null;
  like_count: number | null;
  comment_count: number | null;
  repost_count: number | null;
  source_type: string | null;
}

export interface RefreshResult {
  languages: Record<string, { posts: number; examples: number; use_phrases: number; created: boolean }>;
  posts_read: number;
}

const engagementOf = (p: PostRow) =>
  (p.like_count ?? 0) + (p.comment_count ?? 0) * 3 + (p.repost_count ?? 0) * 5;

const fingerprint = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);

/** Sentences, treating newlines as hard stops the way LinkedIn posts read. */
function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?۔؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** A plain-English description of how this member actually writes. */
function describeRhythm(posts: PostRow[], lang: string): string {
  const texts = posts.map((p) => p.post_text!).filter(Boolean);
  if (!texts.length) return "";
  const sentences = texts.flatMap(sentencesOf);
  const words = sentences.map((s) => s.split(/\s+/).length);
  const avg = Math.round(words.reduce((a, b) => a + b, 0) / Math.max(1, words.length));
  const shortShare = Math.round(
    (words.filter((w) => w <= 8).length / Math.max(1, words.length)) * 100,
  );
  const paras = texts.flatMap((t) => t.split(/\n{2,}/));
  const oneLineShare = Math.round(
    (paras.filter((p) => !p.includes("\n") && p.trim().length > 0).length /
      Math.max(1, paras.length)) * 100,
  );
  const openers = texts.map((t) => sentencesOf(t)[0] ?? "");
  const questionOpeners = Math.round(
    (openers.filter((o) => /[?؟]\s*$/.test(o)).length / Math.max(1, openers.length)) * 100,
  );
  const markers = ["📍", "◆", "↲", "⚠️", "→", "—"].filter((m) =>
    texts.filter((t) => t.includes(m)).length >= 2
  );

  const parts = [
    `Average sentence ${avg} words; ${shortShare}% of sentences are eight words or fewer.`,
    `${oneLineShare}% of paragraphs are a single line.`,
    questionOpeners < 15
      ? "Almost never opens with a question."
      : `Opens with a question in ${questionOpeners}% of posts.`,
  ];
  if (markers.length) parts.push(`Recurring markers: ${markers.join(" ")}.`);
  parts.push(`Observed from ${texts.length} of the member's own ${lang} posts.`);
  return parts.join(" ");
}

/**
 * Phrases the member repeats. Openers and 3–6 word runs that show up in two
 * or more posts are the ones that read as signature rather than coincidence.
 */
function observedUsePhrases(posts: PostRow[]): string[] {
  const texts = posts.map((p) => p.post_text!).filter(Boolean);
  const counts = new Map<string, number>();
  const seenPerPost = texts.map((t) => {
    const seen = new Set<string>();
    const flat = t.replace(/\s+/g, " ").trim();
    const words = flat.split(" ");
    for (let n = 4; n <= 6; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n).join(" ");
        if (gram.length < 14 || gram.length > 70) continue;
        if (/^\W+$/.test(gram)) continue;
        seen.add(gram.replace(/[.,;:]$/, ""));
      }
    }
    // The first line of a post is signature territory.
    const opener = sentencesOf(t)[0];
    if (opener && opener.length >= 10 && opener.length <= 80) seen.add(opener);
    return seen;
  });
  for (const seen of seenPerPost) {
    for (const gram of seen) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  const repeated = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([g]) => g);

  // Drop phrases fully contained in a longer, equally repeated phrase.
  const kept: string[] = [];
  for (const g of repeated) {
    if (!kept.some((k) => k.includes(g))) kept.push(g);
    if (kept.length >= 12) break;
  }
  return kept;
}

export async function refreshVoiceProfiles(db: any, userId: string): Promise<RefreshResult> {
  const { data: rows, error } = await db
    .from("linkedin_posts")
    .select("post_text, post_url, published_at, like_count, comment_count, repost_count, source_type")
    .eq("user_id", userId)
    .in("source_type", OWN_SOURCES)
    .not("post_text", "is", null)
    .order("published_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`read own posts: ${error.message}`);

  const posts: PostRow[] = (rows ?? []).filter(
    (p: PostRow) => (p.post_text ?? "").trim().length >= 120,
  );

  const byLang: Record<string, PostRow[]> = { en: [], ar: [] };
  for (const p of posts) byLang[scriptOf(p.post_text!)].push(p);

  const result: RefreshResult = { languages: {}, posts_read: posts.length };

  for (const lang of ["en", "ar"] as const) {
    const langPosts = byLang[lang];
    if (langPosts.length < 3) continue;

    const { data: existing } = await db
      .from("authority_voice_profiles")
      .select("id, example_posts, vocabulary_preferences, is_primary")
      .eq("user_id", userId)
      .eq("language", lang)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Recent and high-engagement first; recency wins ties within a year.
    const now = Date.now();
    const ranked = [...langPosts].sort((a, b) => {
      const recency = (p: PostRow) => {
        const t = p.published_at ? new Date(p.published_at).getTime() : 0;
        const months = (now - t) / (1000 * 60 * 60 * 24 * 30);
        return Math.max(0, 24 - months) / 24;
      };
      return (engagementOf(b) + recency(b) * 50) - (engagementOf(a) + recency(a) * 50);
    });

    const current: any[] = Array.isArray(existing?.example_posts) ? existing.example_posts : [];
    const seen = new Set(
      current.map((e) => fingerprint(String(e?.content ?? e ?? ""))).filter(Boolean),
    );
    const additions = [] as any[];
    for (const p of ranked) {
      const fp = fingerprint(p.post_text!);
      if (seen.has(fp)) continue;
      seen.add(fp);
      additions.push({
        source: p.source_type ?? "linkedin_own",
        content: p.post_text,
        url: p.post_url,
        published_at: p.published_at,
        engagement: engagementOf(p),
      });
      if (current.length + additions.length >= MAX_EXAMPLES * 2) break;
    }

    // Curated entries are kept; observed ones are trimmed by rank when over cap.
    const curated = current.filter((e) => e?.source !== "linkedin_export" &&
      e?.source !== "linkedin_own" && e?.source !== "aura_generated");
    const observed = [...current.filter((e) => !curated.includes(e)), ...additions]
      .sort((a, b) => (b?.engagement ?? 0) - (a?.engagement ?? 0));
    const examples = [...curated, ...observed].slice(0, MAX_EXAMPLES);

    const vocab = (existing?.vocabulary_preferences ?? {}) as Record<string, any>;
    const curatedUse: string[] = Array.isArray(vocab.use) ? vocab.use : [];
    const observedUse = observedUsePhrases(langPosts)
      .filter((g) => !curatedUse.some((u) => u.toLowerCase().includes(g.toLowerCase())));
    const nextVocab = {
      ...vocab,
      // Curated phrases stay first and are never dropped.
      use: [...curatedUse, ...observedUse].slice(0, 40),
      rhythm: describeRhythm(langPosts, lang),
      observed: {
        posts_analyzed: langPosts.length,
        refreshed_at: new Date().toISOString(),
      },
    };

    if (existing?.id) {
      await db.from("authority_voice_profiles").update({
        example_posts: examples,
        vocabulary_preferences: nextVocab,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await db.from("authority_voice_profiles").insert({
        user_id: userId,
        language: lang,
        is_primary: false,
        example_posts: examples,
        vocabulary_preferences: nextVocab,
      });
    }

    result.languages[lang] = {
      posts: langPosts.length,
      examples: examples.length,
      use_phrases: nextVocab.use.length,
      created: !existing?.id,
    };
  }

  return result;
}