/**
 * Shared retrieval over the member's own knowledge.
 *
 * Caller-agnostic by design: chat surfaces call it today, later extraction
 * stages call it with `kinds: ['evidence_fragment','signal']` to test whether a
 * new document says anything the member does not already hold.
 *
 * Contract:
 * - `userId` MUST come from a verified JWT. The SQL function is SECURITY
 *   DEFINER and takes the user id explicitly, so a caller that trusts a request
 *   body would leak other members' material.
 * - On retrieval failure this THROWS. Callers decide the fallback and must log
 *   a structured warning. A dead search must never again be invisible.
 */

/** Fixed taxonomy. Later phases add 'brief' and 'figure' to the same union. */
export type SourceKind = "document_chunk" | "evidence_fragment" | "entry" | "signal";

export const SOURCE_KINDS: SourceKind[] = [
  "document_chunk",
  "evidence_fragment",
  "entry",
  "signal",
];

export interface RetrievedRow {
  source_kind: SourceKind;
  source_id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  occurred_at: string | null;
  rank: number;
  metadata: Record<string, unknown> | null;
}

export interface RetrieveOptions {
  limit?: number;
  kinds?: SourceKind[] | null;
  caller: string;
}

export interface RetrievalResult {
  rows: RetrievedRow[];
  byKind: Record<SourceKind, RetrievedRow[]>;
  citationBlock: string;
  topRank: number | null;
  latencyMs: number;
  embedded: boolean;
}

const EMBED_MODEL = "text-embedding-3-small";
const MAX_EMBED_CHARS = 8000;

/** Same model used for document_chunks so the vectors are comparable. */
async function embedQuery(query: string): Promise<number[] | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || !query.trim()) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: query.slice(0, MAX_EMBED_CHARS) }),
    });
    if (!r.ok) {
      console.warn(
        JSON.stringify({ stage: "retrieval_embed", status: r.status, error: (await r.text()).slice(0, 300) }),
      );
      return null;
    }
    const j = await r.json();
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch (e) {
    // Embedding failure degrades to keyword-only. It never fails retrieval.
    console.warn(JSON.stringify({ stage: "retrieval_embed", error: (e as Error)?.message ?? String(e) }));
    return null;
  }
}

function emptyByKind(): Record<SourceKind, RetrievedRow[]> {
  return {
    document_chunk: [],
    evidence_fragment: [],
    entry: [],
    signal: [],
  };
}

function formatCitations(rows: RetrievedRow[]): string {
  if (rows.length === 0) return "—";
  return rows
    .map((r, i) => {
      const parts = [
        `[${i + 1}] kind: ${r.source_kind}${r.title ? ` | title: ${r.title}` : ""}${
          r.url ? ` | url: ${r.url}` : ""
        }${r.occurred_at ? ` | date: ${String(r.occurred_at).slice(0, 10)}` : ""}`,
      ];
      if (r.content) parts.push(String(r.content).slice(0, 1200));
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

/** Never allowed to break the caller. */
async function logRetrieval(
  admin: any,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("retrieval_logs").insert(row);
  } catch (e) {
    console.warn(JSON.stringify({ stage: "retrieval_log", error: (e as Error)?.message ?? String(e) }));
  }
}

export async function retrieveContext(
  admin: any,
  userId: string,
  query: string,
  opts: RetrieveOptions,
): Promise<RetrievalResult> {
  const started = Date.now();
  const limit = opts.limit ?? 15;
  const kinds = opts.kinds && opts.kinds.length > 0 ? opts.kinds : null;
  const caller = opts.caller;
  const queryLen = (query || "").length;

  if (!userId) throw new Error("retrieveContext: userId is required");

  const embedding = await embedQuery(query || "");

  const { data, error } = await admin.rpc("search_vault", {
    p_user_id: userId,
    p_query: query || "",
    p_limit: limit,
    p_query_embedding: embedding ? `[${embedding.join(",")}]` : null,
    p_kinds: kinds,
  });

  if (error) {
    const latency = Date.now() - started;
    await logRetrieval(admin, {
      user_id: userId,
      caller,
      query: (query || "").slice(0, 2000),
      query_len: queryLen,
      result_count: 0,
      kinds: kinds ? { requested: kinds } : null,
      top_rank: null,
      degraded: true,
      error: String(error.message ?? error).slice(0, 1000),
      latency_ms: latency,
    });
    // Deliberate: retrieval failure surfaces to the caller. Never swallowed.
    throw new Error(`search_vault failed: ${error.message ?? error}`);
  }

  const rows: RetrievedRow[] = Array.isArray(data) ? (data as RetrievedRow[]) : [];
  const byKind = emptyByKind();
  for (const r of rows) {
    if (byKind[r.source_kind]) byKind[r.source_kind].push(r);
  }
  const topRank = rows.length > 0 ? Number(rows[0].rank ?? 0) : null;
  const latencyMs = Date.now() - started;

  await logRetrieval(admin, {
    user_id: userId,
    caller,
    query: (query || "").slice(0, 2000),
    query_len: queryLen,
    result_count: rows.length,
    kinds: {
      requested: kinds,
      returned: Object.fromEntries(
        (Object.keys(byKind) as SourceKind[]).map((k) => [k, byKind[k].length]),
      ),
    },
    top_rank: topRank,
    degraded: false,
    error: null,
    latency_ms: latencyMs,
  });

  return {
    rows,
    byKind,
    citationBlock: formatCitations(rows),
    topRank,
    latencyMs,
    embedded: !!embedding,
  };
}

/** Structured warning every caller must emit when it falls back. */
export function logRetrievalFailure(args: {
  user_id: string;
  caller: string;
  query_len: number;
  error: unknown;
}): void {
  console.error(
    JSON.stringify({
      stage: "retrieval",
      user_id: args.user_id,
      caller: args.caller,
      query_len: args.query_len,
      error: (args.error as Error)?.message ?? String(args.error),
    }),
  );
}
