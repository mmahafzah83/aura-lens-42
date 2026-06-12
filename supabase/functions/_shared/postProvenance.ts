// Canonical definition of what counts as a "published" LinkedIn post
// and what belongs in the user's tracked Catalog. Mirror of
// src/lib/postProvenance.ts for edge-function use. Keep them in sync.

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

export function isCatalogPost(p: PostLike | null | undefined): boolean {
  if (!p || !p.tracking_status) return false;
  return !CATALOG_EXCLUDED_STATUSES.includes(p.tracking_status);
}

export function applyPublishedFilter<Q extends { in: (col: string, vals: string[]) => Q }>(
  q: Q,
): Q {
  return q
    .in("source_type", PUBLISHED_SOURCE_TYPES)
    .in("tracking_status", PUBLISHED_TRACKING_STATUSES);
}

export function filterPublishedRows<T extends PostLike>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? []).filter(isPublishedPost);
}