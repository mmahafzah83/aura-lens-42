/**
 * One trait, drawn as a spectrum.
 *
 * A measured trait shows the value, the band its own posts span, and where the
 * knob sits inside it. A trait the registry marks `computable = false` shows no
 * value, no knob and no band — Aura cannot read it from text, and saying so is
 * more useful than a fabricated 50.
 *
 * Dragging is local. `onSet` fires exactly once, on release, so a drag is one
 * write rather than one write per pixel.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import {
  BLUE, CYAN_TEXT, GREEN, INK, LINE, MONO, MUTED, RADIUS, SURFACE, TYPE, WHITE,
  chipStyle, monoNum,
} from "@/components/voice/tokens";
import InfoTooltip from "@/components/voice/InfoTooltip";
import type { DnaTrait } from "@/lib/voiceDna";

const PROVENANCE: Record<string, { label: string; bg: string; fg: string; border: string; explain: string }> = {
  learned: {
    label: "Learned", bg: "#EBF9F8", fg: CYAN_TEXT, border: "#B8E6E4",
    explain: "Aura measured this from your own posts. It keeps adjusting as you publish.",
  },
  user: {
    label: "Set by you", bg: "#EAF3FB", fg: BLUE, border: "#BBD6EE",
    explain: "You set this value yourself. Aura will not adjust it, and feedback cannot override it.",
  },
  aura: {
    label: "Suggested by Aura", bg: "#FBF4E4", fg: "#9A6F12", border: "#F0DFB4",
    explain: "A proposal Aura has not proved yet. Confirm it or reject it — it is not counted until you do.",
  },
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence", medium: "Medium confidence", low: "Low confidence",
};

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

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
  /** The knob's position while the member is moving it. Nothing is written yet. */
  const [draft, setDraft] = useState<number | null>(null);
  const [setting, setSetting] = useState(false);
  const [openActions, setOpenActions] = useState(false);
  const keyTimer = useRef<number | null>(null);
  const pending = useRef<number | null>(null);

  const measured = trait.value !== null;
  const prov = PROVENANCE[trait.source ?? ""] ?? null;
  const knobColour = trait.locked ? INK : BLUE;
  const shown = draft ?? (measured ? Math.round(trait.value as number) : 0);

  const valueFromClientX = useCallback((clientX: number) => {
    const el = rail.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    return Math.round(clamp(((clientX - r.left) / r.width) * 100));
  }, []);

  /** Keyboard writes are debounced — one press should not cost a reload. */
  const flushKeys = useCallback(() => {
    if (keyTimer.current !== null) { window.clearTimeout(keyTimer.current); keyTimer.current = null; }
    if (pending.current !== null) { const v = pending.current; pending.current = null; setDraft(null); onSet(v); }
  }, [onSet]);

  const nudge = (next: number) => {
    const v = clamp(next);
    setDraft(v);
    pending.current = v;
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(flushKeys, 400);
  };

  useEffect(() => () => { if (keyTimer.current !== null) window.clearTimeout(keyTimer.current); }, []);

  const endDrag = (commitAt: number | null) => {
    if (!dragging) return;
    setDragging(false);
    const v = commitAt ?? draft;
    setDraft(null);
    if (v !== null) onSet(v);
  };

  const hasBand = trait.band_low !== null && trait.band_high !== null && trait.band_high > trait.band_low;
  const spread = hasBand ? Math.round(((trait.band_high as number) - (trait.band_low as number)) / 2) : null;

  const valueText = `${trait.display_name}, ${shown}%, between ${trait.pole_low} and ${trait.pole_high}`;

  return (
    <div className="vd-row" style={{ padding: "14px 0", borderBlockStart: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>{trait.display_name}</span>
        {measured && (
          <span style={{ ...monoNum, fontSize: TYPE.bodyLg, fontWeight: 600, color: BLUE }}>{shown}%</span>
        )}
        {prov && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={chipStyle(prov.fg, prov.bg, prov.border)}>{prov.label}</span>
            <InfoTooltip term={prov.label} body={prov.explain} />
          </span>
        )}
        {trait.locked && (
          <span aria-label="Locked — Aura will not adjust this" style={{ display: "inline-flex", color: INK }}>
            <Lock size={13} />
          </span>
        )}

        <span className="vd-actions" style={{ marginInlineStart: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="vd-act vd-act-edit"
            aria-expanded={openActions}
            onClick={() => setOpenActions((v) => !v)}
          >
            {openActions ? "Done" : "Edit"}
          </button>
          <span className="vd-act-group" data-open={openActions ? "1" : "0"}>
            {measured && (
              <>
                <button type="button" className="vd-act" disabled={busy} onClick={onLock}>
                  {trait.locked ? <Unlock size={12} /> : <Lock size={12} />}
                  {trait.locked ? "Unlock" : "Lock"}
                </button>
                <button
                  type="button" className="vd-act"
                  disabled={busy || trait.learned_value === null || trait.source === "learned"}
                  onClick={onRestore}
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
            {!trait.computable && !measured && !setting && (
              <button type="button" className="vd-act" disabled={busy} onClick={() => setSetting(true)}>
                Set this yourself
              </button>
            )}
          </span>
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBlockStart: 8 }}>
        <span style={{ fontSize: TYPE.caption, color: MUTED }}>{trait.pole_low}</span>
        <span style={{ fontSize: TYPE.caption, color: MUTED }}>{trait.pole_high}</span>
      </div>

      {measured ? (
        // The 44px wrapper is the tap target; the 6px rail inside it is the drawing.
        <div
          className="vd-track"
          role="slider"
          tabIndex={0}
          aria-label={trait.display_name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown}
          aria-valuetext={valueText}
          aria-disabled={busy || undefined}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setDragging(true);
            const v = valueFromClientX(e.clientX);
            if (v !== null) setDraft(v);
          }}
          onPointerMove={(e) => {
            if (!dragging) return;
            const v = valueFromClientX(e.clientX);
            if (v !== null) setDraft(v);
          }}
          onPointerUp={(e) => endDrag(valueFromClientX(e.clientX))}
          onPointerCancel={() => { setDragging(false); setDraft(null); }}
          onLostPointerCapture={() => { setDragging(false); setDraft(null); }}
          onBlur={flushKeys}
          onKeyDown={(e) => {
            const cur = shown;
            const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
            if (!keys.includes(e.key)) return;
            e.preventDefault();
            if (e.key === "ArrowRight" || e.key === "ArrowUp") nudge(cur + 1);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") nudge(cur - 1);
            else if (e.key === "PageUp") nudge(cur + 10);
            else if (e.key === "PageDown") nudge(cur - 10);
            else if (e.key === "Home") nudge(0);
            else if (e.key === "End") nudge(100);
          }}
        >
          <div ref={rail} className="vd-rail">
            {hasBand && (
              <div
                aria-hidden
                style={{
                  position: "absolute", insetBlock: 0, borderRadius: RADIUS.rail, background: "rgba(6,112,196,.16)",
                  insetInlineStart: `${clamp(trait.band_low as number)}%`,
                  inlineSize: `${clamp((trait.band_high as number) - (trait.band_low as number))}%`,
                }}
              />
            )}
            <div
              aria-hidden
              style={{
                position: "absolute", insetBlockStart: "50%", insetInlineStart: `${clamp(shown)}%`,
                transform: "translate(-50%,-50%)", inlineSize: 18, blockSize: 18, borderRadius: "50%",
                background: knobColour, border: `3px solid ${WHITE}`, boxShadow: "0 1px 4px rgba(15,21,25,.22)",
              }}
            />
          </div>
        </div>
      ) : setting ? (
        <div
          className="vd-track"
          role="button"
          tabIndex={0}
          aria-label={`Set ${trait.display_name} — press the track where you sit`}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            onSet(50);
            setSetting(false);
          }}
          onPointerDown={(e) => {
            const v = valueFromClientX(e.clientX);
            setSetting(false);
            if (v !== null) onSet(v);
          }}
        >
          <div ref={rail} className="vd-rail" style={{ outline: "2px solid rgba(6,112,196,.25)", outlineOffset: 3 }} />
        </div>
      ) : (
        <div aria-hidden style={{ blockSize: 6, borderRadius: RADIUS.rail, marginBlockStart: 8, background: SURFACE }} />
      )}

      {measured ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBlockStart: 8 }}>
          {trait.confidence && (
            <span style={chipStyle(
              trait.confidence === "high" ? GREEN : MUTED,
              trait.confidence === "high" ? "#E8F5EF" : SURFACE,
            )}>
              {CONFIDENCE_LABEL[trait.confidence] ?? trait.confidence}
            </span>
          )}
          <span style={{ fontSize: TYPE.caption, color: MUTED }}>
            {trait.source === "user"
              ? "Set by you"
              : trait.evidence_count === null
                ? "Learned from your posts"
                : `Learned from ${trait.evidence_count} posts`}
          </span>
          {trait.last_confirmed_at && (
            <span style={{ ...monoNum, fontSize: TYPE.caption, color: MUTED }}>
              Last confirmed {shortDate(trait.last_confirmed_at)}
            </span>
          )}
          {spread !== null && (
            <span style={{ ...monoNum, fontSize: TYPE.caption, color: MUTED }}>±{spread}% range across your posts</span>
          )}
        </div>
      ) : setting ? (
        <div style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 8, fontFamily: MONO }}>
          Press the track where you sit between {trait.pole_low.toLowerCase()} and {trait.pole_high.toLowerCase()}.
        </div>
      ) : (
        <div style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 8 }}>
          Not measured yet — Aura can't read this from text alone
        </div>
      )}
    </div>
  );
}
