import { Target, Clock } from "lucide-react";

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
        border: "1px solid hsl(var(--border) / 0.4)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      {/* Dark gradient header */}
      <div
        style={{
          background: "linear-gradient(135deg, #2C2418, #3D3226)",
          padding: "16px 18px",
          color: "#E8DCC8",
        }}
      >
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
          <Target size={13} color="#B08D3A" />
          <span style={{
            fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#B08D3A", opacity: 0.75, fontWeight: 600,
          }}>
            Your next move
          </span>
        </div>
        <div className="flex items-baseline" style={{ gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#D4B056", lineHeight: 1.35 }}>
            {signalTitle}
          </span>
          {confidencePct != null && (
            <span style={{ fontSize: 11, color: "rgba(212,176,86,0.55)" }}>
              {confidencePct}%
            </span>
          )}
        </div>
        <p style={{
          fontSize: 13, lineHeight: 1.55, color: "rgba(232,220,200,0.85)",
          margin: "8px 0 0",
        }}>
          {actionText}
        </p>
      </div>

      {/* Light footer */}
      <div
        className="flex items-center"
        style={{
          background: "hsl(var(--card))",
          padding: "12px 18px",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onDraft}
          style={{
            background: "#B08D3A", color: "#fff",
            border: 0, fontSize: 12, fontWeight: 500,
            padding: "8px 16px", borderRadius: 8, cursor: "pointer",
          }}
        >
          Draft this post
        </button>
        {onFullBrief && (
          <button
            type="button"
            onClick={onFullBrief}
            style={{
              background: "transparent", color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            }}
          >
            Full brief
          </button>
        )}
        {publishWindow && (
          <div className="flex items-center" style={{
            gap: 5, marginLeft: "auto", fontSize: 11,
            color: "hsl(var(--muted-foreground))",
          }}>
            <Clock size={12} />
            <span>{publishWindow}</span>
          </div>
        )}
      </div>
    </div>
  );
}