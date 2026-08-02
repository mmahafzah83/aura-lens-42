/**
 * Step 1 — a deck starts from a signal the member already owns, never from a
 * blank topic box. A blank box is why the old studio produced two drafts in
 * its lifetime: it asked the member to do the hard part first.
 */
import React, { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Chip } from "@/components/systemb";

export interface StudioSignal {
  id: string;
  signal_title: string;
  explanation: string | null;
  strategic_implications: string | null;
  theme_tags: string[] | null;
  confidence: number | null;
  priority_score: number | null;
  created_at?: string | null;
}

const card: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "start",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  padding: 16,
  cursor: "pointer",
  fontFamily: "var(--ff-ui)",
  transition: "box-shadow 180ms ease, border-color 180ms ease",
};

const mono: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase",
};

type Sort = "newest" | "confidence" | "priority";
const PAGE = 12;

/** Same title, different row: the founder should see one card, not two. */
function dedupe(list: StudioSignal[]): StudioSignal[] {
  const seen = new Map<string, StudioSignal>();
  for (const s of list) {
    const key = String(s.signal_title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const prior = seen.get(key);
    // Keep the stronger of the duplicates rather than whichever arrived first.
    if (!prior || (s.confidence ?? 0) > (prior.confidence ?? 0)) seen.set(key, s);
  }
  return [...seen.values()];
}

function firstLine(s: StudioSignal): string {
  const raw = (s.explanation ?? s.strategic_implications ?? "").replace(/\s+/g, " ").trim();
  return raw.length > 150 ? `${raw.slice(0, 147)}…`.replace("…", "") : raw;
}

/** What the deck would open with — the cover is always the signal's own claim. */
function opensWith(s: StudioSignal): string {
  const t = String(s.signal_title ?? "").trim();
  return t.length > 90 ? `${t.slice(0, 88)}` : t;
}

export function SignalPicker({
  signals, loading, onSelect,
}: {
  signals: StudioSignal[];
  loading: boolean;
  onSelect: (s: StudioSignal) => void;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("priority");
  const [shown, setShown] = useState(PAGE);

  const unique = useMemo(() => dedupe(signals), [signals]);

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of unique) for (const t of s.theme_tags ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [unique]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = unique.filter((s) => {
      const inTag = !tag || (s.theme_tags ?? []).includes(tag);
      if (!inTag) return false;
      if (!q) return true;
      return (
        String(s.signal_title ?? "").toLowerCase().includes(q) ||
        (s.theme_tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "confidence") return (b.confidence ?? 0) - (a.confidence ?? 0);
      if (sort === "priority") return (b.priority_score ?? 0) - (a.priority_score ?? 0);
      return Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "") || 0;
    });
    return list;
  }, [unique, query, tag, sort]);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...card, height: 96, background: "var(--surface-subtle)", border: "none" }} />
        ))}
      </div>
    );
  }

  if (!unique.length) {
    return (
      <div style={{ ...card, cursor: "default", textAlign: "center", padding: 32 }}>
        <p style={{ fontSize: 15, color: "var(--text-primary)", margin: "0 0 6px" }}>
          You have no signals yet.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.6 }}>
          A carousel is built from a signal Aura has found in your own material. Capture a few things and
          the first signals arrive overnight.
        </p>
        <a
          href="/dashboard"
          style={{
            fontFamily: "var(--ff-mono)", fontSize: 11, letterSpacing: ".08em",
            textTransform: "uppercase", color: "var(--brand)", textDecoration: "none",
          }}
        >
          Go to capture
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* find one */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute", insetInlineStart: 13, top: "50%", transform: "translateY(-50%)",
              color: "var(--text-muted)", pointerEvents: "none",
            }}
          />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
            placeholder="Search your signals"
            aria-label="Search your signals"
            style={{
              width: "100%", boxSizing: "border-box", padding: "11px 14px 11px 36px",
              borderRadius: 12, background: "var(--surface-card)",
              border: "1px solid var(--border-default)", color: "var(--text-primary)",
              fontFamily: "var(--ff-ui)", fontSize: 14, outline: "none",
            }}
          />
        </div>

        {topTags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {topTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTag(tag === t ? null : t); setShown(PAGE); }}
                style={{
                  ...mono, borderRadius: 999, padding: "6px 11px", cursor: "pointer",
                  background: tag === t ? "var(--surface-inverse)" : "var(--surface-card)",
                  color: tag === t ? "var(--text-inverse)" : "var(--text-secondary)",
                  border: `1px solid ${tag === t ? "var(--surface-inverse)" : "var(--border-default)"}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...mono, color: "var(--text-muted)" }}>
            {filtered.length} signal{filtered.length === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {([["priority", "Strongest"], ["confidence", "Most certain"], ["newest", "Newest"]] as Array<[Sort, string]>)
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSort(key); setShown(PAGE); }}
                  style={{
                    ...mono, background: "none", border: "none", cursor: "pointer", padding: 0,
                    color: sort === key ? "var(--brand)" : "var(--text-muted)",
                  }}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ ...card, cursor: "default", fontSize: 13.5, color: "var(--text-secondary)" }}>
          Nothing matches that. Try a different word, or clear the filter.
        </div>
      )}

      {filtered.slice(0, shown).map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid="studio-signal-card"
          title={`Opens with: ${opensWith(s)}`}
          style={card}
          onClick={() => onSelect(s)}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
              {s.signal_title}
            </span>
            <ArrowRight size={15} style={{ color: "var(--text-muted)", flex: "0 0 auto", marginTop: 3 }} />
          </div>
          {firstLine(s) && (
            <p
              style={{
                fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: "6px 0 0",
                display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {firstLine(s)}
            </p>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <span
              style={{
                fontFamily: "var(--ff-mono)", fontSize: 10.5, letterSpacing: ".06em",
                color: "var(--text-muted)", textTransform: "uppercase",
              }}
            >
              {Math.round((s.confidence ?? 0) * 100)}% confidence
            </span>
            {(s.theme_tags ?? []).slice(0, 3).map((t) => (
              <Chip key={t} variant="cooling">{t}</Chip>
            ))}
          </div>
        </button>
      ))}

      {shown < filtered.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          style={{
            ...mono, padding: "12px 0", cursor: "pointer", borderRadius: 12,
            background: "var(--surface-card)", border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          Show more
        </button>
      )}
    </div>
  );
}

export default SignalPicker;