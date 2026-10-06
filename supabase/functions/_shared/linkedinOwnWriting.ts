/**
 * linkedinOwnWriting.ts — what the member actually wrote on LinkedIn.
 *
 * One place that asks Apify for a member's own posts (last 12 months, quote
 * posts kept, pure reshares never requested) and his own comments on other
 * people's posts, and one budget for how much of it a model sees.
 * The filters are pure so they can be unit-tested without a network.
 */

export const POSTS_ACTOR = "harvestapi~linkedin-profile-posts";
export const COMMENTS_ACTOR = "harvestapi~linkedin-profile-comments";
export const MAX_POSTS = 50;
export const MAX_COMMENTS = 30;
export const POST_CHARS = 2000;
export const COMMENT_CHARS = 600;
export const PARENT_CHARS = 200;
export const MIN_COMMENT_WORDS = 15;
export const OWN_WRITING_BUDGET = 40_000;

export type OwnPost = { text: string; at: number | null; quote: boolean };
export type OwnComment = { text: string; at: number | null; parent: string };

/** Twelve calendar months before `now`. */
export function twelveMonthsAgo(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - 12);
  return d;
}

/** A timestamp in ms from any of the shapes these actors use, or null. */
export function itemTime(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return itemTime(o.timestamp ?? o.date ?? null);
  }
  return null;
}

/** Kept when dated inside the window; undated items are kept (the actor already applied the date limit). */
export function withinWindow(at: number | null, since: Date): boolean {
  return at == null || at >= since.getTime();
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

const handleOf = (o: any): string =>
  String(o?.publicIdentifier ?? o?.universalName ?? "").toLowerCase();

/** The shared post inside a quote post, wherever the actor put it. */
function quotedOf(it: any): unknown {
  return it?.repost ?? it?.reshared ?? it?.resharedPost ?? it?.quotedPost ?? null;
}

/**
 * His own posts. A quote post keeps only his added text (`content`); the
 * shared post underneath is never his writing and is never sent.
 */
export function filterOwnPosts(items: unknown[], handle: string, since: Date): OwnPost[] {
  const wanted = handle.toLowerCase();
  const out: OwnPost[] = [];
  for (const it of items as any[]) {
    if (!it || typeof it !== "object") continue;
    const who = handleOf(it.author);
    if (who && who !== wanted) continue;
    const text = typeof it.content === "string" ? it.content.trim() : "";
    if (!text) continue; // a pure reshare carries no text of his
    const at = itemTime(it.postedAt ?? it.createdAt ?? null);
    if (!withinWindow(at, since)) continue;
    out.push({ text: text.slice(0, POST_CHARS), at, quote: !!quotedOf(it) });
    if (out.length >= MAX_POSTS) break;
  }
  return out;
}

/** His own comments of at least 15 words, with the first 200 characters of the parent post. */
export function filterOwnComments(items: unknown[], handle: string, since: Date): OwnComment[] {
  const wanted = handle.toLowerCase();
  const out: OwnComment[] = [];
  for (const it of items as any[]) {
    if (!it || typeof it !== "object") continue;
    const who = handleOf(it.author ?? it.actor);
    if (who && who !== wanted) continue;
    const text = typeof it.commentary === "string" ? it.commentary.trim() : "";
    if (wordCount(text) < MIN_COMMENT_WORDS) continue;
    const at = itemTime(it.createdAt ?? it.postedAt ?? null);
    if (!withinWindow(at, since)) continue;
    const parentRaw = typeof it.post?.content === "string" ? it.post.content : "";
    out.push({
      text: text.slice(0, COMMENT_CHARS),
      at,
      parent: parentRaw.replace(/\s+/g, " ").trim().slice(0, PARENT_CHARS),
    });
    if (out.length >= MAX_COMMENTS) break;
  }
  return out;
}

/**
 * At most `budget` characters of his own words, newest kept: the oldest item
 * across both lists is dropped first until the rest fits. Parent-post context
 * does not count; it is not his writing.
 */
export function applyBudget(
  posts: OwnPost[], comments: OwnComment[], budget = OWN_WRITING_BUDGET,
): { posts: OwnPost[]; comments: OwnComment[]; chars: number } {
  type Row = { kind: "p" | "c"; i: number; at: number; len: number };
  const rows: Row[] = [
    ...posts.map((p, i) => ({ kind: "p" as const, i, at: p.at ?? Number.MAX_SAFE_INTEGER, len: p.text.length })),
    ...comments.map((c, i) => ({ kind: "c" as const, i, at: c.at ?? Number.MAX_SAFE_INTEGER, len: c.text.length })),
  ];
  let total = rows.reduce((a, r) => a + r.len, 0);
  const dropped = new Set<string>();
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    if (total <= budget) break;
    dropped.add(r.kind + r.i);
    total -= r.len;
  }
  return {
    posts: posts.filter((_, i) => !dropped.has("p" + i)),
    comments: comments.filter((_, i) => !dropped.has("c" + i)),
    chars: total,
  };
}

/** The two labelled blocks the model reads. */
export function ownWritingBlocks(posts: OwnPost[], comments: OwnComment[]): string {
  const p = posts.length
    ? `YOUR POSTS (${posts.length}):\n` + posts.map((x, i) =>
        x.quote
          ? `POST ${i + 1} (your comment on a shared post; only your words are shown): ${x.text}`
          : `POST ${i + 1}: ${x.text}`).join("\n\n")
    : "YOUR POSTS (0): none were available.";
  const c = comments.length
    ? `YOUR COMMENTS ON OTHER PEOPLE'S POSTS (${comments.length}):\n` + comments.map((x, i) =>
        `COMMENT ${i + 1}: ${x.text}\n  (context, not your words — the post you replied to began: ${x.parent || "unavailable"})`).join("\n\n")
    : "YOUR COMMENTS ON OTHER PEOPLE'S POSTS (0): none were available.";
  return `${p}\n\n${c}`;
}

async function runActor(actor: string, input: unknown, token: string, ms = 45_000): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal },
    );
    if (res.status !== 200 && res.status !== 201) {
      console.error(`[ownWriting] ${actor} status ${res.status}:`, (await res.text()).slice(0, 300));
      return [];
    }
    const items = await res.json().catch(() => null);
    return Array.isArray(items) ? items : [];
  } catch (e) {
    console.error(`[ownWriting] ${actor} failed:`, e instanceof Error ? e.message : String(e));
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Raw posts items, last 12 months, quote posts in, pure reshares out. Never throws. */
export function fetchPostItems(canonical_url: string, token: string, now = new Date()): Promise<unknown[]> {
  return runActor(POSTS_ACTOR, {
    targetUrls: [canonical_url],
    maxPosts: MAX_POSTS,
    postedLimitDate: twelveMonthsAgo(now).toISOString(),
    includeReposts: false,
    includeQuotePosts: true,
    scrapeReactions: false,
    scrapeComments: false,
  }, token);
}

/** Raw comment items written by the profile. Never throws. */
export function fetchCommentItems(canonical_url: string, token: string): Promise<unknown[]> {
  return runActor(COMMENTS_ACTOR, { targetUrls: [canonical_url], maxItems: MAX_COMMENTS }, token);
}
