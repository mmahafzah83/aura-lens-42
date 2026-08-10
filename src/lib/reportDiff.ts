// Pure, dependency-free comparison of two report snapshot `data` objects.
// No React. No network. No Supabase.

export interface ReportDiffRow {
  label: string;
  from: string;
  to: string;
  direction: "up" | "down" | "flat";
}

const IGNORED = /(id|_at|uuid|url)/i;
const MAX_ROWS = 6;
const MAX_DEPTH = 6;

function humanise(path: string): string {
  const last = path.split(".").pop() || path;
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function walk(
  cur: unknown,
  prev: unknown,
  path: string,
  depth: number,
  out: { path: string; from: number; to: number }[],
): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(cur) && Array.isArray(prev)) {
    out.push({ path, from: prev.length, to: cur.length });
    return;
  }
  if (typeof cur === "number" && typeof prev === "number") {
    if (Number.isFinite(cur) && Number.isFinite(prev)) out.push({ path, from: prev, to: cur });
    return;
  }
  if (isPlainObject(cur) && isPlainObject(prev)) {
    for (const key of Object.keys(cur)) {
      if (IGNORED.test(key)) continue;
      if (!(key in prev)) continue;
      walk(cur[key], prev[key], path ? `${path}.${key}` : key, depth + 1, out);
    }
  }
}

export function diffReports(current: unknown, previous: unknown): ReportDiffRow[] {
  if (!isPlainObject(current) || !isPlainObject(previous)) return [];
  const leaves: { path: string; from: number; to: number }[] = [];
  walk(current, previous, "", 0, leaves);

  return leaves
    .filter((l) => l.from !== l.to)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, MAX_ROWS)
    .map((l) => ({
      label: humanise(l.path),
      from: fmt(l.from),
      to: fmt(l.to),
      direction: l.to > l.from ? ("up" as const) : l.to < l.from ? ("down" as const) : ("flat" as const),
    }));
}

export default diffReports;
