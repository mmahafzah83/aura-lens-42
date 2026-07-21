import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  themes: string[] | null;
  dropped_themes: string[] | null;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
};

function hostFromUrl(u: string | null): string {
  if (!u) return "";
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

interface AddressProfile {
  first_name: string | null;
  level: string | null;
  sector_focus: string | null;
}

interface GhostDraft {
  id: string;
  source_metadata: Record<string, any> | null;
  created_at: string;
}

const AgentFindingCard = ({ userId }: { userId: string | null }) => {
  const [pending, setPending] = useState<Finding[]>([]);
  const [totalEver, setTotalEver] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [busy, setBusy] = useState<"keep" | "dismiss" | null>(null);
  const [profile, setProfile] = useState<AddressProfile | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const explainerInitedRef = useRef(false);
  const seenIdRef = useRef<string | null>(null);
  const [ghostDraft, setGhostDraft] = useState<GhostDraft | null>(null);
  const [ghostBusy, setGhostBusy] = useState(false);
  const navigate = useNavigate();

  const current = pending[0] ?? null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const fortyEightAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const [{ data: pendingRows }, { count: allCount }, { data: profileRow }, { data: ghostRows }] = await Promise.all([
        supabase
          .from("agent_findings" as any)
          .select("id, title, url, source, implication, entry_id, created_at, themes, dropped_themes")
          .eq("user_id", userId)
          .eq("status", "pending")
          .not("entry_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("agent_findings" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("diagnostic_profiles" as any)
          .select("first_name, level, sector_focus")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("linkedin_posts" as any)
          .select("id, source_metadata, created_at")
          .eq("user_id", userId)
          .eq("tracking_status", "draft")
          .eq("source_metadata->>ghost_draft", "true")
          .is("source_metadata->>ghost_draft_opened", null)
          .gte("created_at", fortyEightAgo)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (cancelled) return;
      setPending(((pendingRows as any) || []) as Finding[]);
      setTotalEver(allCount ?? 0);
      setProfile((profileRow as any) ?? null);
      setGhostDraft(((ghostRows as any)?.[0] as GhostDraft) ?? null);
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

  if (loading) return null;

  // Ghost draft branch — shown ONLY when there is no pending finding to clear.
  // Pending card takes priority.
  if (!current) {
    if (!ghostDraft) return null;

    const PANEL_BG = "#131009";
    const PANEL_BORDER = "rgba(241,236,225,0.12)";
    const INK_HI = "#F6F2E8";
    const INK_LOW = "rgba(241,236,225,0.55)";
    const TEAL = "#36C5B0";

    const handleOpenGhost = async () => {
      if (ghostBusy) return;
      setGhostBusy(true);
      try {
        const prev = (ghostDraft.source_metadata ?? {}) as Record<string, any>;
        const merged = { ...prev, ghost_draft_opened: true, ghost_draft_opened_at: new Date().toISOString() };
        await supabase
          .from("linkedin_posts" as any)
          .update({ source_metadata: merged })
          .eq("id", ghostDraft.id);
        track("ghost_draft_opened", { post_id: ghostDraft.id });
        setGhostDraft(null);
        navigate("/?tab=authority");
      } catch {
        setGhostBusy(false);
      }
    };

    return (
      <section
        aria-label="Written for you overnight"
        style={{ overflow: "hidden", marginBottom: 22 }}
      >
        <div
          style={{
            position: "relative",
            background: "var(--ob-bg, #131009)",
            border: `1px solid ${PANEL_BORDER}`,
            boxShadow: "0 8px 28px -10px rgba(27,23,18,0.45)",
            padding: 20,
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 1,
              background: "linear-gradient(90deg, transparent, rgba(54,197,176,0.7), transparent)",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              className="agent-finding-dot"
              style={{
                width: 6, height: 6, borderRadius: "50%", background: TEAL,
                boxShadow: "0 0 12px rgba(54,197,176,0.8)",
                display: "inline-block", flexShrink: 0,
              }}
            />
            <span
              style={{
                ...MONO, fontSize: 10, letterSpacing: "0.22em",
                textTransform: "uppercase", color: TEAL,
              }}
            >
              THE OVERNIGHT
            </span>
            <span
              style={{
                ...MONO, fontSize: 10, letterSpacing: "0.18em",
                textTransform: "uppercase", color: INK_LOW,
              }}
            >
              · Written for you
            </span>
          </div>
          <p
            style={{
              margin: "12px 0 16px 0",
              fontFamily: "var(--font-serif)",
              fontSize: 15, fontWeight: 400, lineHeight: 1.5,
              color: INK_HI,
            }}
          >
            A draft is waiting — written the way you write.
          </p>
          <button
            type="button"
            onClick={handleOpenGhost}
            disabled={ghostBusy}
            style={{
              ...MONO,
              minHeight: 44,
              padding: "0 18px",
              background: TEAL,
              color: PANEL_BG,
              fontWeight: 500,
              border: 0,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: ghostBusy ? "wait" : "pointer",
              opacity: ghostBusy ? 0.7 : 1,
            }}
          >
            Open it
          </button>
        </div>

        <style>{`
          @keyframes agent-finding-ring {
            0%   { box-shadow: 0 0 0 0 rgba(54,197,176,0.55); }
            70%  { box-shadow: 0 0 0 8px rgba(54,197,176,0);   }
            100% { box-shadow: 0 0 0 0 rgba(54,197,176,0);     }
          }
          .agent-finding-dot { animation: agent-finding-ring 2.4s ease-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .agent-finding-dot { animation: none; }
          }
        `}</style>
      </section>
    );
  }

  const remainingBeyondShown = Math.max(0, pending.length - 1);
  const isFirstEver = totalEver === 1;
  // Initialize explainer open-state once per finding shown: expanded on first-ever, else collapsed.
  if (!explainerInitedRef.current) {
    explainerInitedRef.current = true;
    if (isFirstEver) setExplainerOpen(true);
  }
  const heroText =
    (current.implication && current.implication.trim()) ||
    current.title ||
    "";
  const sourceLabel = (current.source || hostFromUrl(current.url) || "").trim();
  const articleTitle = (current.title || current.url || "").trim();
  const addressParts = [profile?.first_name, profile?.level, profile?.sector_focus]
    .map((p) => (p ?? "").toString().trim())
    .filter((p) => p.length > 0);
  const addressLine = addressParts.length > 0 ? `TO: ${addressParts.join(" · ")}` : "";

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

  const PANEL_BG = "#131009";
  const PANEL_BORDER = "rgba(241,236,225,0.12)";
  const INK_HI = "#F6F2E8";
  const INK_MID = "rgba(241,236,225,0.7)";
  const INK_LOW = "rgba(241,236,225,0.55)";
  const INK_DIM = "rgba(241,236,225,0.45)";
  const INK_MUTE = "rgba(241,236,225,0.6)";
  const RULE_SOFT = "rgba(241,236,225,0.15)";
  const STRIP_BG = "rgba(241,236,225,0.08)";
  const STRIP_BORDER = "rgba(241,236,225,0.1)";
  const TEAL = "#36C5B0";
  const AMBER = "#D6A748";

  return (
    <section
      aria-label="Found for you overnight"
      style={{
        overflow: "hidden",
        transition: "max-height 320ms ease, opacity 260ms ease, margin 260ms ease",
        maxHeight: collapsing ? 0 : 1600,
        opacity: collapsing ? 0 : 1,
        marginBottom: collapsing ? 0 : 22,
      }}
    >
      <div
        style={{
          position: "relative",
          background: "var(--ob-bg, #131009)",
          border: `1px solid ${PANEL_BORDER}`,
          boxShadow: "0 8px 28px -10px rgba(27,23,18,0.45)",
          padding: 20,
        }}
      >
        {/* Top edge glow */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(54,197,176,0.7), transparent)",
            pointerEvents: "none",
          }}
        />
        {confirming ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <span
                style={{
                  ...MONO,
                  fontSize: 9.5,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: TEAL,
                  border: `1px solid ${TEAL}`,
                  padding: "4px 8px",
                  transform: "rotate(-1.2deg)",
                  display: "inline-block",
                }}
              >
                Cleared
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                aria-hidden
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: TEAL,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M4.5 10.5l3.2 3.2 7.8-7.8" stroke="#131009" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ ...MONO, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_HI }}>
                  In your radar now
                </span>
                <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: INK_MUTE }}>
                  The signal is live in your Observatory.
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Header row: eyebrow left, clearance stamp right */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-hidden
                  className="agent-finding-dot"
                  style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: TEAL,
                    boxShadow: "0 0 12px rgba(54,197,176,0.8)",
                    display: "inline-block", flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    ...MONO, fontSize: 10, letterSpacing: "0.22em",
                    textTransform: "uppercase", color: TEAL,
                  }}
                >
                  THE OVERNIGHT
                </span>
                <span
                  style={{
                    ...MONO, fontSize: 10, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: INK_LOW,
                  }}
                >
                  · Found for you
                </span>
              </div>
              <span
                style={{
                  ...MONO,
                  fontSize: 9.5,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: AMBER,
                  border: `1px solid ${AMBER}`,
                  padding: "4px 8px",
                  transform: "rotate(-1.2deg)",
                  display: "inline-block",
                }}
              >
                For your clearance
              </span>
            </div>

            {/* Addressed line */}
            {addressLine && (
              <div
                style={{
                  ...MONO,
                  marginTop: 10,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: INK_DIM,
                  wordBreak: "break-word",
                }}
              >
                {addressLine}
              </div>
            )}

            {/* Italic serif line */}
            <p
              style={{
                margin: "10px 0 12px 0",
                fontFamily: "var(--font-serif)", fontStyle: "italic",
                fontSize: 13.5, color: INK_MUTE, lineHeight: 1.5,
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
                fontSize: 22, fontWeight: 400, lineHeight: 1.36,
                color: INK_HI,
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
                  background: STRIP_BG,
                  border: `1px solid ${STRIP_BORDER}`,
                  padding: "8px 10px",
                  textDecoration: "none",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    ...MONO, fontSize: 11, lineHeight: 1.5,
                    color: INK_MID,
                    wordBreak: "break-word", overflowWrap: "anywhere",
                  }}
                >
                  {sourceLabel && (
                    <span style={{ color: AMBER, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {sourceLabel}
                    </span>
                  )}
                  {sourceLabel && articleTitle ? "  ·  " : ""}
                  {articleTitle}
                </span>
              </a>
            )}

            {/* Learning trace: newly dropped themes */}
            {current.dropped_themes && current.dropped_themes.length > 0 && (
              <div
                style={{
                  ...MONO,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(241,236,225,0.45)",
                  marginBottom: 10,
                  wordBreak: "break-word",
                }}
              >
                No longer tracking: {current.dropped_themes.join(" · ")}
              </div>
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
                  background: TEAL,
                  color: PANEL_BG,
                  fontWeight: 500,
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
                  color: INK_DIM,
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
                    ...MONO, fontSize: 10.5, color: INK_DIM,
                  }}
                >
                  {remainingBeyondShown} more waiting
                </span>
              )}
              <button
                type="button"
                onClick={() => setExplainerOpen((v) => !v)}
                style={{
                  ...MONO,
                  marginInlineStart: "auto",
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  fontSize: 10.5,
                  color: INK_DIM,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
                aria-expanded={explainerOpen}
              >
                {explainerOpen ? "Got it" : "What is this?"}
              </button>
            </div>

            {/* Explainer (replaces old first-ever footnote) */}
            {explainerOpen && (
              <div
                style={{
                  marginTop: 14, paddingTop: 12,
                  borderTop: `1px dashed ${RULE_SOFT}`,
                  display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                {[
                  "Aura works while you're away — reading your territory so you don't have to.",
                  "Only what's directly relevant to you clears the bar. Everything else is filtered out.",
                  "Nothing enters your radar without your say. Keep it, or dismiss it — your call, always.",
                ].map((line, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-serif)", fontStyle: "italic",
                      fontSize: 13, color: INK_MUTE, lineHeight: 1.5,
                    }}
                  >
                    {line}
                  </p>
                ))}
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