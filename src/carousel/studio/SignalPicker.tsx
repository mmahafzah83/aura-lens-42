/**
 * Step 1 — a deck starts from a signal the member already owns, never from a
 * blank topic box. A blank box is why the old studio produced two drafts in
 * its lifetime: it asked the member to do the hard part first.
 */
import React from "react";
import { ArrowRight } from "lucide-react";
import { Chip } from "@/components/systemb";

export interface StudioSignal {
  id: string;
  signal_title: string;
  explanation: string | null;
  strategic_implications: string | null;
  theme_tags: string[] | null;
  confidence: number | null;
  priority_score: number | null;
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

export function SignalPicker({
  signals, loading, onSelect,
}: {
  signals: StudioSignal[];
  loading: boolean;
  onSelect: (s: StudioSignal) => void;
}) {
  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...card, height: 96, background: "var(--surface-subtle)", border: "none" }} />
        ))}
      </div>
    );
  }

  if (!signals.length) {
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
          href="/n"
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
      {signals.map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid="studio-signal-card"
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
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

export default SignalPicker;