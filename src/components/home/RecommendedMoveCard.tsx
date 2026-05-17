import { Target, Clock, Linkedin } from "lucide-react";

interface Props {
  signalTitle: string;
  confidencePct?: number | null;
  actionText: string;
  publishWindow?: string | null;
  onDraft: () => void;
  onFullBrief?: () => void;
}

export default function RecommendedMoveCard({
  signalTitle, confidencePct, actionText, publishWindow, onDraft, onFullBrief,
}: Props) {
  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--aura-border)",
      }}
    >
      {/* Dark gradient header */}
      <div
        style={{
          background: "var(--aura-card)",
          borderBottom: "1px solid var(--aura-border)",
          padding: "16px 18px",
          color: "var(--aura-t1)",
        }}
      >
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
          <Target size={13} color="var(--aura-accent)" />
          <span style={{
            fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--aura-accent)", opacity: 0.85, fontWeight: 600,
          }}>
            Your next move
          </span>
        </div>
        <div className="flex items-baseline" style={{ gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--aura-accent)", lineHeight: 1.35 }}>
            {signalTitle}
          </span>
          {confidencePct != null && (
            <span style={{ fontSize: 11, color: "var(--aura-t3)", fontFamily: "'JetBrains Mono', monospace" }}>
              {confidencePct}%
            </span>
          )}
        </div>
        <p style={{
          fontSize: 13, lineHeight: 1.55, color: "var(--aura-t2)",
          margin: "8px 0 0",
        }}>
          {actionText}
        </p>
      </div>

      {/* Light footer */}
      <div
        className="flex items-center"
        style={{
          background: "var(--aura-card-glass)",
          padding: "12px 18px",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onDraft}
          className="inline-flex items-center"
          style={{
            background: "var(--aura-accent)", color: "var(--aura-bg)",
            border: 0, fontSize: 12, fontWeight: 500,
            padding: "8px 16px", borderRadius: 8, cursor: "pointer", gap: 6,
          }}
        >
          <Linkedin size={13} />
          Post on LinkedIn →
        </button>
        {onFullBrief && (
          <button
            type="button"
            onClick={onFullBrief}
            style={{
              background: "transparent", color: "var(--aura-t1)",
              border: "1px solid var(--aura-border)",
              fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            }}
          >
            Full brief
          </button>
        )}
        {publishWindow && (
          <div className="flex items-center" style={{
            gap: 5, marginLeft: "auto", fontSize: 11,
            color: "var(--aura-t2)",
          }}>
            <Clock size={12} />
            <span>{publishWindow}</span>
          </div>
        )}
      </div>
    </div>
  );
}