// Canonical definition of what counts as a "published" LinkedIn post
// and what belongs in the user's tracked Catalog. This is one of two
// source-of-truth files (the other lives at
// supabase/functions/_shared/postProvenance.ts for edge functions).
//
// Do NOT inline (source_type, tracking_status) tests anywhere else —
// always import from here.

export type PostLike = {
  source_type?: string | null;
  tracking_status?: string | null;
};

export const PUBLISHED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["aura_generated", "published"],
  ["linkedin_export", "tracked"],
  ["browser_capture", "confirmed"],
  ["browser_capture", "metrics_imported"],
  ["search_discovery", "confirmed"],
  ["manual_url", "manual"],
  ["carousel_studio", "published"],
];

const pairKey = (s?: string | null, t?: string | null) => `${s ?? ""}::${t ?? ""}`;
const PAIR_SET = new Set(PUBLISHED_PAIRS.map(([s, t]) => pairKey(s, t)));

export function isPublishedPost(p: PostLike | null | undefined): boolean {
  if (!p) return false;
  return PAIR_SET.has(pairKey(p.source_type, p.tracking_status));
}

export const PUBLISHED_SOURCE_TYPES: string[] = Array.from(
  new Set(PUBLISHED_PAIRS.map(([s]) => s)),
);
export const PUBLISHED_TRACKING_STATUSES: string[] = Array.from(
  new Set(PUBLISHED_PAIRS.map(([, t]) => t)),
);

export const CATALOG_EXCLUDED_STATUSES: string[] = [
  "rejected",
  "external_reference",
];

// ---------------------------------------------------------------------------
// THE TWO NUMBERS. Never merge them, never label one as the other.
//
//  1. publishedLive       — the post exists publicly on LinkedIn, whoever
//                           wrote it. Includes imported history.
//  2. publishedThroughAura — Aura produced the draft and the user published
//                           it. This is the product's output claim.
//
// Implemented as a TypeScript module rather than a Postgres function because
// every surface already fetches these rows for other reasons (charts, tables,
// week grids), so a predicate they can apply to rows they already hold keeps
// the rendered list and the headline number provably identical. A SQL
// function would give a number no surface could reconcile against its own
// list, and would still need a TS twin for row-level filtering.
// ---------------------------------------------------------------------------

export const AURA_PUBLISHED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["aura_generated", "published"],
  ["carousel_studio", "published"],
];
const AURA_SET = new Set(AURA_PUBLISHED_PAIRS.map(([s, t]) => pairKey(s, t)));

/** Aura produced the draft and the user published it. */
export function isAuraPublishedPost(p: PostLike | null | undefined): boolean {
  if (!p) return false;
  return AURA_SET.has(pairKey(p.source_type, p.tracking_status));
}

/** Live on LinkedIn but NOT produced by Aura (imported / discovered history). */
export function isImportedPublishedPost(p: PostLike | null | undefined): boolean {
  return isPublishedPost(p) && !isAuraPublishedPost(p);
}

// published_at is NOT trustworthy as a filter: it is set on every
// linkedin_export row and every aura publish, but on none of the
// browser/search-confirmed rows, and on 1 of 28 external_reference rows.
// Filtering on `published_at is not null` therefore both under-counts real
// live posts and lets non-user references in. Always filter on the
// (source_type, tracking_status) pair and use this for the date only.
export function postEffectiveDate(
  p: { published_at?: string | null; created_at?: string | null } | null | undefined,
): string | null {
  return p?.published_at ?? p?.created_at ?? null;
}

export type PostCountRow = PostLike & {
  published_at?: string | null;
  created_at?: string | null;
};

export interface PostCounts {
  /** Live on LinkedIn, any author path. */
  live: number;
  /** Live on LinkedIn AND produced by Aura. Subset of `live`. */
  throughAura: number;
  /** Live on LinkedIn, not produced by Aura. live - throughAura. */
  imported: number;
}

export function countPosts(rows: PostCountRow[] | null | undefined, since?: string): PostCounts {
  const all = (rows ?? []).filter((r) => {
    if (!since) return true;
    const d = postEffectiveDate(r);
    return !!d && d >= since;
  });
  const live = all.filter(isPublishedPost);
  const throughAura = live.filter(isAuraPublishedPost);
  return { live: live.length, throughAura: throughAura.length, imported: live.length - throughAura.length };
}

/** Single fetch every surface can use. Returns raw rows + both counts. */
export async function loadPostCounts(
  client: any,
  userId: string,
  since?: string,
): Promise<{ rows: PostCountRow[]; counts: PostCounts }> {
  const rows: PostCountRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await client
      .from("linkedin_posts")
      .select("source_type, tracking_status, published_at, created_at")
      .eq("user_id", userId)
      .range(from, from + PAGE - 1);
    const batch = (data || []) as PostCountRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows, counts: countPosts(rows, since) };
}

export function isCatalogPost(p: PostLike | null | undefined): boolean {
  if (!p || !p.tracking_status) return false;
  return !CATALOG_EXCLUDED_STATUSES.includes(p.tracking_status);
}

// Query-builder helpers. These narrow server-side as much as is reliable
// (.in() over both columns is a SUPERSET of the canonical pairs), and the
// callers MUST run filterPublishedRows() on returned rows to apply the
// exact pair logic. Correctness > cleverness.
export function applyPublishedFilter<Q extends { in: (col: string, vals: string[]) => Q }>(
  q: Q,
): Q {
  return q
    .in("source_type", PUBLISHED_SOURCE_TYPES)
    .in("tracking_status", PUBLISHED_TRACKING_STATUSES);
}

export function applyCatalogFilter<Q extends {
  not: (col: string, op: string, val: any) => Q;
  neq: (col: string, val: string) => Q;
}>(q: Q): Q {
  let out: Q = q.not("tracking_status", "is", null);
  for (const s of CATALOG_EXCLUDED_STATUSES) {
    out = out.neq("tracking_status", s);
  }
  return out;
}

export function filterPublishedRows<T extends PostLike>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? []).filter(isPublishedPost);
}

export function filterCatalogRows<T extends PostLike>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? []).filter(isCatalogPost);
}