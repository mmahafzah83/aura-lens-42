/**
 * One trait, drawn as a spectrum.
 *
 * A measured trait shows the value, the band its own posts span, and where the
 * knob sits inside it. A trait the registry marks `computable = false` shows no
 * value, no knob and no band — Aura cannot read it from text, and saying so is
 * more useful than a fabricated 50.
 */
import { useCallback, useRef, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { BLUE, GREEN, INK, LINE, MONO, MUTED, monoNum } from "@/components/voice/tokens";
import type { DnaTrait } from "@/lib/voiceDna";

const PROVENANCE: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  learned: { label: "Learned", bg: "#EBF9F8", fg: "#00807B", border: "#B8E6E4" },
  user: { label: "Set by you", bg: "#EAF3FB", fg: "#0670C4", border: "#BBD6EE" },
  aura: { label: "Suggested by Aura", bg: "#FBF4E4", fg: "#9A6F12", border: "#F0DFB4" },
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export default function SpectrumRow({
  trait, busy, onSet, onLock, onRestore, onConfirm, onReject,
}: {
  trait: DnaTrait;
  busy: boolean;
  onSet: (value: number) => void;
  onLock: () => void;
  onRestore: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const rail = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const measured = trait.value !== null;
  const prov = PROVENANCE[trait.source ?? ""] ?? null;
  const knobColour = trait.locked ? INK : BLUE;

  const valueFromEvent = useCallback((clientX: number) => {
    const el = rail.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const commit = (clientX: number) => {
    const v = valueFromEvent(clientX);
    if (v !== null) onSet(v);
  };

  const hasBand = trait.band_low !== null && trait.band_high !== null && trait.band_high > trait.band_low;
  const spread = hasBand ? Math.round(((trait.band_high as number) - (trait.band_low as number)) / 2) : null;

  return (
    <div className="vd-row" style={{ padding: "14px 0", borderBlockStart: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>{trait.display_name}</span>
        {measured && (
          <span style={{ ...monoNum, fontSize: 14.5, fontWeight: 600, color: BLUE }}>
            {Math.round(trait.value as number)}%
          </span>
        )}
        {prov && (
          <span style={{
            background: prov.bg, color: prov.fg, border: `1px solid ${prov.border}`, borderRadius: 6,
            padding: "2px 7px", fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: ".08em",
            textTransform: "uppercase",
          }}>{prov.label}</span>
        )}
        {trait.locked && (
          <span title="Locked — Aura will not adjust this." style={{ display: "inline-flex", color: INK }}>
            <Lock size={13} />
          </span>
        )}

        <span className="vd-actions" style={{ marginInlineStart: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {measured && (
            <>
              <button type="button" className="vd-act" disabled={busy} onClick={onLock}
                title={trait.locked ? "Locked — Aura will not adjust this." : "Lock this so Aura stops adjusting it."}>
                {trait.locked ? <Unlock size={12} /> : <Lock size={12} />}
                {trait.locked ? "Unlock" : "Lock"}
              </button>
              <button
                type="button" className="vd-act" disabled={busy || trait.learned_value === null || trait.source === "learned"}
                onClick={onRestore}
                title={trait.learned_value === null ? "Aura has not learned a value for this yet." : "Go back to the value Aura measured."}
              >
                Restore Aura's
              </button>
            </>
          )}
          {trait.source === "aura" && (
            <>
              <button type="button" className="vd-act" disabled={busy} onClick={onConfirm}>Confirm</button>
              <button type="button" className="vd-act" disabled={busy} onClick={onReject}>Reject</button>
            </>
          )}
          {!trait.computable && !measured && (
            <button type="button" className="vd-act" disabled={busy} onClick={() => onSet(50)}>Set this yourself</button>
          )}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBlockStart: 8 }}>
        <span style={{ fontSize: 11.5, color: measured ? MUTED : "#A3AEBB" }}>{trait.pole_low}</span>
        <span style={{ fontSize: 11.5, color: measured ? MUTED : "#A3AEBB" }}>{trait.pole_high}</span>
      </div>

      {measured ? (
        <div
          ref={rail}
          role="slider"
          tabIndex={0}
          aria-label={`${trait.display_name}, ${Math.round(trait.value as number)} percent`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(trait.value as number)}
          onPointerDown={(e) => { setDragging(true); (e.target as Element).setPointerCapture?.(e.pointerId); commit(e.clientX); }}
          onPointerMove={(e) => { if (dragging) commit(e.clientX); }}
          onPointerUp={() => setDragging(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onSet(Math.min(100, Math.round(trait.value as number) + 1));
            if (e.key === "ArrowLeft") onSet(Math.max(0, Math.round(trait.value as number) - 1));
          }}
          style={{
            position: "relative", blockSize: 6, borderRadius: 3, marginBlockStart: 8,
            background: "linear-gradient(90deg,#EDF1F6,#DDE4EC)", cursor: "pointer", touchAction: "none",
          }}
        >
          {hasBand && (
            <div
              aria-hidden
              style={{
                position: "absolute", insetBlock: 0, borderRadius: 3, background: "rgba(6,112,196,.16)",
                insetInlineStart: `${trait.band_low}%`, inlineSize: `${(trait.band_high as number) - (trait.band_low as number)}%`,
              }}
            />
          )}
          <div
            aria-hidden
            style={{
              position: "absolute", insetBlockStart: "50%", insetInlineStart: `${trait.value}%`,
              transform: "translate(-50%,-50%)", inlineSize: 18, blockSize: 18, borderRadius: "50%",
              background: knobColour, border: "3px solid #FFFFFF", boxShadow: "0 1px 4px rgba(15,21,25,.22)",
            }}
          />
        </div>
      ) : (
        <div aria-hidden style={{ blockSize: 6, borderRadius: 3, marginBlockStart: 8, background: "#F1F4F8" }} />
      )}

      {measured ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBlockStart: 8 }}>
          {trait.confidence && (
            <span style={{
              background: trait.confidence === "high" ? "#E8F5EF" : "#F2F5F9",
              color: trait.confidence === "high" ? GREEN : MUTED,
              borderRadius: 6, padding: "2px 7px", fontFamily: MONO, fontSize: 10, fontWeight: 600,
              letterSpacing: ".08em", textTransform: "uppercase",
            }}>{CONFIDENCE_LABEL[trait.confidence] ?? trait.confidence}</span>
          )}
          <span style={{ fontSize: 11.5, color: MUTED }}>
            {trait.source === "user"
              ? "Set by you"
              : trait.evidence_count === null
                ? "Learned from your posts"
                : `Learned from ${trait.evidence_count} posts`}
          </span>
          {trait.last_confirmed_at && (
            <span style={{ ...monoNum, fontSize: 11, color: MUTED }}>Last confirmed {shortDate(trait.last_confirmed_at)}</span>
          )}
          {spread !== null && (
            <span style={{ ...monoNum, fontSize: 11, color: MUTED }}>±{spread}% range across your posts</span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: MUTED, marginBlockStart: 8 }}>
          Not measured yet — Aura can't read this from text alone
        </div>
      )}
    </div>
  );
}