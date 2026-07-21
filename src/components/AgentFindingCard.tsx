import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/track";

/**
 * Overnight finding card. Rendered as the first block on the Brief (bone
 * surface). Shows ONE card at a time — the newest pending finding for the
 * signed-in user. Never a stack.
 *
 * User-visible chrome is English only; the words "agent", "AI", "bot" are
 * intentionally absent from copy. Language: "Aura found this for you", "Aura
 * now reads your territory overnight", etc.
 */

interface Finding {
  id: string;
  title: string | null;
  url: string | null;
  source: string | null;
  implication: string | null;
  entry_id: string | null;
  created_at: string;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
};

function hostFromUrl(u: string | null): string {
  if (!u) return "";
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const AgentFindingCard = ({ userId }: { userId: string | null }) => {
  const [pending, setPending] = useState<Finding[]>([]);
  const [totalEver, setTotalEver] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [busy, setBusy] = useState<"keep" | "dismiss" | null>(null);
  const seenIdRef = useRef<string | null>(null);

  const current = pending[0] ?? null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: pendingRows }, { count: allCount }] = await Promise.all([
        supabase
          .from("agent_findings" as any)
          .select("id, title, url, source, implication, entry_id, created_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .not("entry_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("agent_findings" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      if (cancelled) return;
      setPending(((pendingRows as any) || []) as Finding[]);
      setTotalEver(allCount ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Fire 'seen' once per unique finding shown.
  useEffect(() => {
    if (!current) return;
    if (seenIdRef.current === current.id) return;
    seenIdRef.current = current.id;
    track("agent_card_seen", { finding_id: current.id });
  }, [current]);

  if (loading || !current) return null;

  const remainingBeyondShown = Math.max(0, pending.length - 1);
  const isFirstEver = totalEver === 1;
  const heroText =
    (current.implication && current.implication.trim()) ||
    current.title ||
    "";
  const sourceLabel = (current.source || hostFromUrl(current.url) || "").trim();
  const articleTitle = (current.title || current.url || "").trim();

  const handleKeep = async () => {
    if (busy) return;
    setBusy("keep");
    const { error } = await supabase
      .from("agent_findings" as any)
      .update({ status: "kept" })
      .eq("id", current.id);
    if (error) { setBusy(null); return; }
    track("agent_finding_kept", { finding_id: current.id });
    setConfirming(true);
    window.setTimeout(() => {
      setCollapsing(true);
      window.setTimeout(() => {
        setPending((prev) => prev.slice(1));
        setConfirming(false);
        setCollapsing(false);
        setBusy(null);
      }, 320);
    }, 2000);
  };

  const handleDismiss = async () => {
    if (busy) return;
    setBusy("dismiss");
    const { error } = await supabase
      .from("agent_findings" as any)
      .update({ status: "dismissed" })
      .eq("id", current.id);
    if (error) { setBusy(null); return; }
    track("agent_finding_dismissed", { finding_id: current.id });
    setPending((prev) => prev.slice(1));
    setBusy(null);
  };

  return (
    <section
      aria-label="Found for you overnight"
      style={{
        overflow: "hidden",
        transition: "max-height 320ms ease, opacity 260ms ease, margin 260ms ease",
        maxHeight: collapsing ? 0 : 1200,
        opacity: collapsing ? 0 : 1,
        marginBottom: collapsing ? 0 : 22,
      }}
    >
      <div
        style={{
          background: "#FDFBF6",
          border: "1px solid var(--rule)",
          borderInlineStart: "3px solid #36C5B0",
          boxShadow: "0 1px 0 rgba(27,23,18,0.06)",
          padding: "16px 18px",
        }}
      >
        {confirming ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              aria-hidden
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "#36C5B0",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M4.5 10.5l3.2 3.2 7.8-7.8" stroke="#FDFBF6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ ...MONO, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink)" }}>
                In your radar now
              </span>
              <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-2)" }}>
                The signal is live in your Observatory.
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Eyebrow row: pulsing dot + mono label */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                aria-hidden
                className="agent-finding-dot"
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#36C5B0", display: "inline-block", flexShrink: 0,
                }}
              />
              <span
                style={{
                  ...MONO, fontSize: 10, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "var(--ink-3)",
                }}
              >
                Found for you · Overnight
              </span>
            </div>

            {/* Italic serif line */}
            <p
              style={{
                margin: "8px 0 12px 0",
                fontFamily: "var(--font-serif)", fontStyle: "italic",
                fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5,
              }}
            >
              While you were busy, this moved in your market.
            </p>

            {/* Hero — the implication */}
            <p
              dir="auto"
              style={{
                margin: "0 0 14px 0",
                fontFamily: "var(--font-serif)",
                fontSize: 21, fontWeight: 500, lineHeight: 1.34,
                color: "var(--ink)",
                wordBreak: "break-word", overflowWrap: "anywhere",
              }}
            >
              {heroText}
            </p>

            {/* Article reference strip */}
            {(sourceLabel || articleTitle) && current.url && (
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  background: "var(--paper-2)",
                  border: "1px solid var(--rule)",
                  padding: "8px 10px",
                  textDecoration: "none",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    ...MONO, fontSize: 11, lineHeight: 1.5,
                    color: "var(--ink-2)",
                    wordBreak: "break-word", overflowWrap: "anywhere",
                  }}
                >
                  {sourceLabel && (
                    <span style={{ color: "#6E2A26", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {sourceLabel}
                    </span>
                  )}
                  {sourceLabel && articleTitle ? "  ·  " : ""}
                  {articleTitle}
                </span>
              </a>
            )}

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleKeep}
                disabled={busy !== null}
                style={{
                  ...MONO,
                  minHeight: 44,
                  padding: "0 18px",
                  background: "var(--ink)",
                  color: "var(--paper)",
                  border: 0,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy === "keep" ? 0.7 : 1,
                }}
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={busy !== null}
                style={{
                  ...MONO,
                  minHeight: 44,
                  padding: "0 12px",
                  background: "transparent",
                  color: "var(--ink-3)",
                  border: 0,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Dismiss
              </button>
              {remainingBeyondShown > 0 && (
                <span
                  style={{
                    ...MONO, fontSize: 10.5, color: "var(--ink-3)",
                    marginInlineStart: "auto",
                  }}
                >
                  {remainingBeyondShown} more waiting
                </span>
              )}
            </div>

            {/* First-ever footnote */}
            {isFirstEver && (
              <div
                style={{
                  marginTop: 14, paddingTop: 12,
                  borderTop: "1px dashed var(--rule)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-serif)", fontStyle: "italic",
                    fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5,
                  }}
                >
                  Aura now reads your territory overnight. Only what clears the bar reaches you.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes agent-finding-ring {
          0%   { box-shadow: 0 0 0 0 rgba(54,197,176,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(54,197,176,0);   }
          100% { box-shadow: 0 0 0 0 rgba(54,197,176,0);     }
        }
        .agent-finding-dot {
          animation: agent-finding-ring 2.4s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .agent-finding-dot { animation: none; }
        }
      `}</style>
    </section>
  );
};

export default AgentFindingCard;