/**
 * Merge a freshly scraped LinkedIn profile with the member's previous snapshot.
 *
 * A scrape that paginates short must never be able to shrink a member's record.
 * Every list field is a UNION keyed on stable identity fields — never on whole
 * object equality, because `issuedByLogo.url` (and every other media URL) carries
 * signed `?e=&v=&t=` params that rotate on every read and would make every item
 * look brand new.
 */

type Row = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");
/**
 * Items usable for keying. A bare string list (`["Python","SQL"]` — this scraper
 * emits some lists that way) is coerced to `{ name: s }` for KEYING ONLY; the
 * original value is carried alongside so the stored shape never changes.
 */
type Item = { key: Row; original: unknown };
const items = (v: unknown): Item[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
      if (typeof x === "string" && x.trim()) return [{ key: { name: x } as Row, original: x }];
      if (x && typeof x === "object") return [{ key: x as Row, original: x }];
      return [];
    })
    : [];
const nonEmptyArray = (v: unknown): unknown[] | null =>
  Array.isArray(v) && v.length > 0 ? (v as unknown[]) : null;


const first = (o: Row, keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
    if (typeof v === "number") return String(v);
    if (v && typeof v === "object") {
      const nested = first(v as Row, ["name", "title", "text", "value", "linkedinText", "year", "date"]);
      if (nested) return nested;
    }
  }
  return "";
};

/** Identity keys. Deliberately narrow: stable text only, never URLs or logos. */
const KEYS: Record<string, (o: Row) => string> = {
  certifications: (o) => `${first(o, ["title", "name"])}|${first(o, ["issuedBy", "issuer", "organization", "authority"])}`,
  skills: (o) => first(o, ["name", "title", "skill"]),
  experience: (o) =>
    `${first(o, ["companyName", "company", "organisation"])}|${first(o, ["position", "title", "role"])}|${
      first(o, ["startDate", "starts_at", "startedOn", "start"])
    }`,
  education: (o) => `${first(o, ["schoolName", "school", "institution", "title"])}|${first(o, ["degree", "degreeName", "subtitle"])}`,
  languages: (o) => first(o, ["name", "language", "title"]),
};

/**
 * Union of new and previous, NEW FIRST. An item from the previous snapshot is
 * carried forward only when its identity key is absent from the new read.
 * Items with no usable identity key are kept from the new read only (they
 * cannot be matched, so carrying them forward would duplicate them forever).
 */
export function unionByIdentity(field: string, next: unknown, prev: unknown): unknown[] | null {
  const keyOf = KEYS[field];
  const a = arr(next);
  const b = arr(prev);
  if (!keyOf) return a.length ? a : (b.length ? b : null);
  if (!a.length && !b.length) return null;

  const seen = new Set<string>();
  for (const item of a) {
    const k = keyOf(item);
    if (k.replace(/\|/g, "")) seen.add(k);
  }
  const out: Row[] = [...a];
  for (const item of b) {
    const k = keyOf(item);
    if (!k.replace(/\|/g, "")) continue; // unmatchable — do not resurrect
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out.length ? out : null;
}

const carry = (next: unknown, prev: unknown): unknown => {
  if (typeof next === "string" && next.trim()) return next;
  if (next !== null && next !== undefined && typeof next !== "string") return next;
  return prev ?? null;
};

export interface SnapshotFields {
  [key: string]: unknown;
  full_name: unknown;
  headline: unknown;
  about: unknown;
  photo_url: unknown;
  location: unknown;
  followers: unknown;
  connections: unknown;
  experience: unknown;
  education: unknown;
  skills: unknown;
  languages: unknown;
  certifications: unknown;
  raw: unknown;
}

const LIST_FIELDS = ["certifications", "skills", "experience", "education", "languages"] as const;

/**
 * Returns the row to INSERT. `prev` may be null — then the new read stands alone.
 * `followers` and `connections` ALWAYS take the new value: they legitimately move
 * and must never be unioned or maxed.
 */
export function mergeSnapshot(next: SnapshotFields, prev: Row | null): SnapshotFields {
  if (!prev) return next;

  const merged: Record<string, unknown> = { ...next };

  for (const f of LIST_FIELDS) {
    merged[f] = unionByIdentity(f, (next as unknown as Row)[f], prev[f]);
  }

  for (const f of ["about", "headline", "full_name", "photo_url", "location"]) {
    merged[f] = carry((next as unknown as Row)[f], prev[f]);
  }

  // followers / connections: new value wins, always. No union, no max.
  merged.followers = next.followers;
  merged.connections = next.connections;

  // raw is the new payload untouched, except that the merged lists are written
  // back so raw and the promoted columns can never disagree.
  const rawNext = next.raw && typeof next.raw === "object" ? { ...(next.raw as Row) } : next.raw;
  if (rawNext && typeof rawNext === "object") {
    const prevRaw = prev.raw && typeof prev.raw === "object" ? (prev.raw as Row) : {};
    for (const f of LIST_FIELDS) {
      const rawUnion = unionByIdentity(f, (rawNext as Row)[f] ?? (next as unknown as Row)[f], prevRaw[f] ?? prev[f]);
      if (rawUnion) (rawNext as Row)[f] = rawUnion;
    }
  }
  merged.raw = rawNext;

  return merged as unknown as SnapshotFields;
}
