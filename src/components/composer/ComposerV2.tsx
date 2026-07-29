import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CreateTab } from "@/components/tabs/AuthorityTab";
import { loadStartCards, type StartCard } from "./startCards";
import { Chip } from "@/components/systemb";
import { Loader2, Sparkles, TrendingUp, FileText } from "lucide-react";

/**
 * COMPOSER — one page, three zones.
 *
 *   ZONE 1  START    new: three honest, data-ranked ways in.
 *   ZONE 2  WRITE    the existing CreateTab engine, re-homed unmodified.
 *   ZONE 3  PUBLISH  the existing terminal state, inside CreateTab, untouched.
 *
 * Zones 2 and 3 mount the real CreateTab. Generation, save, draft-ID adoption,
 * the atomic publisher and the provenance strip are therefore byte-identical to
 * what shipped — this file adds a shell, it does not re-implement machinery.
 *
 * Colour law on this page: cyan only while the machine is generating, blue for
 * the user's turn, amber never (nothing here has a deadline).
 */

type Prefill = {
  topic: string;
  context: string;
  signalId?: string;
  signalTitle?: string;
  contentFormat?: "post" | "carousel" | "framework_summary";
  source?: string;
};

interface ComposerV2Props {
  signalPrefill?: any;
  onSignalPrefillConsumed?: () => void;
  draftPrefill?: any;
  onDraftPrefillConsumed?: () => void;
  onGoToLibrary?: () => void;
  onOpenCapture?: () => void;
}

const KIND_META: Record<StartCard["kind"], { label: string; Icon: typeof Sparkles }> = {
  new_evidence: { label: "New evidence since you wrote", Icon: Sparkles },
  accelerating: { label: "Accelerating this week", Icon: TrendingUp },
  never_written: { label: "Never written about", Icon: FileText },
};

function ZoneLabel({ n, title, note }: { n: string; title: string; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
      <span
        style={{
          fontFamily: "var(--ff-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".14em",
          color: "var(--text-muted)",
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-muted)",
        }}
      >
        {title}
      </span>
      {note && (
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12, color: "var(--text-secondary)" }}>
          {note}
        </span>
      )}
    </div>
  );
}

function StartCardTile({
  card,
  active,
  onPick,
}: {
  card: StartCard;
  active: boolean;
  onPick: () => void;
}) {
  const { label, Icon } = KIND_META[card.kind];
  return (
    <button
      type="button"
      onClick={onPick}
      className="text-left w-full"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        borderRadius: 12,
        background: "var(--surface-card)",
        border: `1px solid ${active ? "var(--act)" : "var(--border-default)"}`,
        boxShadow: active ? "0 0 0 3px var(--act-tint)" : "var(--shadow-card)",
        cursor: "pointer",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        minWidth: 0,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <Icon size={13} style={{ color: "var(--act)", flexShrink: 0 }} aria-hidden />
        <span
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--act)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </span>

      <span
        dir="auto"
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 15.5,
          fontWeight: 650,
          lineHeight: 1.35,
          color: "var(--text-primary)",
          overflowWrap: "anywhere",
        }}
      >
        {card.title}
      </span>

      <span
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--text-secondary)",
          overflowWrap: "anywhere",
        }}
      >
        {card.reason}
      </span>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <span
          style={{
            fontFamily: "var(--ff-mono)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            letterSpacing: ".04em",
          }}
        >
          {card.fragmentCount} sources
        </span>
        {active && <Chip variant="scheduled">In the draft</Chip>}
      </span>
    </button>
  );
}

export default function ComposerV2({
  signalPrefill,
  onSignalPrefillConsumed,
  draftPrefill,
  onDraftPrefillConsumed,
  onGoToLibrary,
  onOpenCapture,
}: ComposerV2Props) {
  const [cards, setCards] = useState<StartCard[]>([]);
  const [totalSignals, setTotalSignals] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [localPrefill, setLocalPrefill] = useState<Prefill | null>(null);
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) { if (!cancelled) setLoading(false); return; }
        const res = await loadStartCards(session.user.id);
        if (cancelled) return;
        setCards(res.cards);
        setTotalSignals(res.totalSignals);
      } catch {
        if (!cancelled) setTotalSignals(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pick = (c: StartCard) => {
    setActiveSignalId(c.signalId);
    setLocalPrefill({
      topic: c.title,
      context: c.insight || c.reason,
      signalId: c.signalId,
      signalTitle: c.title,
      contentFormat: "post",
      source: "composer_start_card",
    });
    setTimeout(() => {
      document.getElementById("composer-zone-write")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  // The parent's prefill always wins; ours is the fallback channel.
  const effectivePrefill = signalPrefill ?? localPrefill;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
      {/* ── ZONE 1 — START ───────────────────────────────────────────── */}
      <section aria-label="Start">
        <ZoneLabel n="01" title="Start from a signal" note="Ranked from what your signals actually did." />

        {loading ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--ff-ui)",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Reading your signals…
          </div>
        ) : cards.length === 0 ? (
          <div
            style={{
              padding: 18,
              borderRadius: 12,
              border: "1px dashed var(--border-strong)",
              background: "var(--surface-card)",
              fontFamily: "var(--ff-ui)",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}
          >
            {totalSignals === 0
              ? "Your strongest starting points will sit here, drawn from your own signals. There are none yet — one capture is enough to begin."
              : "Nothing stands out to start from right now. Write from a topic below."}
            {totalSignals === 0 && onOpenCapture && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={onOpenCapture}
                  style={{
                    fontFamily: "var(--ff-ui)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-inverse)",
                    background: "var(--act)",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 16px",
                    cursor: "pointer",
                  }}
                >
                  Capture something
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`,
              gap: 12,
            }}
          >
            {cards.map((c) => (
              <StartCardTile
                key={c.signalId + c.kind}
                card={c}
                active={activeSignalId === c.signalId}
                onPick={() => pick(c)}
              />
            ))}
          </div>
        )}

        {!loading && cards.length > 0 && cards.length < 3 && (
          <p
            style={{
              marginTop: 10,
              fontFamily: "var(--ff-ui)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Only {cards.length} start{cards.length === 1 ? "" : "s"} qualify today. Aura will not invent more.
          </p>
        )}
      </section>

      {/* ── ZONE 2 + 3 — WRITE, then PUBLISH ─────────────────────────── */}
      <section aria-label="Write" id="composer-zone-write" style={{ minWidth: 0 }}>
        <ZoneLabel n="02" title="Write in your voice" note="Aura drafts it. You own the last edit." />
        <div style={{ minWidth: 0 }}>
          <CreateTab
            signalPrefill={effectivePrefill as any}
            onSignalPrefillConsumed={() => {
              setLocalPrefill(null);
              onSignalPrefillConsumed?.();
            }}
            draftPrefill={draftPrefill}
            onDraftPrefillConsumed={onDraftPrefillConsumed}
            onGoToLibrary={onGoToLibrary}
          />
        </div>
      </section>
    </div>
  );
}