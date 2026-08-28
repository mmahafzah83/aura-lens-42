import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  GROUP_TITLES, MISSING_REASON, PANEL_OPTIONS, WATCH_OPTIONS, ensureWatchDefaults, isOn,
  loadCapabilities, loadDeskPrefs,
  panelOn, saveDeskPrefs, type Capabilities, type DeskPrefs, type WatchOption,
} from "./deskPrefs";
import {
  KIND_LABEL, forgetAll, forgetOne, loadLearning, type LearningRow,
} from "./deskLearning";

/**
 * What your Desk watches — the gear.
 *
 * A capability he cannot use today stays visible with its honest reason. A
 * hidden capability is one he never asks for.
 */

const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";
const CANVAS = "#F2F5F9";
const SANS = "Inter, system-ui, sans-serif";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Opens the one-field LinkedIn sheet on the Desk, in place. */
  onAddLinkedIn: () => void;
}

function Toggle({ on, disabled, label, onChange }: {
  on: boolean; disabled?: boolean; label: string; onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="ask-focusable"
      style={{
        flex: "0 0 auto", width: 42, height: 24, borderRadius: 999,
        border: `1px solid ${on && !disabled ? BLUE : LINE}`,
        background: disabled ? CANVAS : on ? BLUE : WHITE,
        position: "relative", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1, padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, insetInlineStart: on && !disabled ? 20 : 2,
        width: 18, height: 18, borderRadius: 999,
        background: on && !disabled ? WHITE : MUTED, transition: "inset-inline-start .12s ease",
      }} />
    </button>
  );
}

export default function DeskWatchSheet({ open, onClose, onAddLinkedIn }: Props) {
  const [prefs, setPrefs] = useState<DeskPrefs>({});
  const [caps, setCaps] = useState<Capabilities>({ cv_crosscheck: false, linkedin_profile: false });
  /** What the Desk has learned about working with him — visible, and erasable. */
  const [learning, setLearning] = useState<LearningRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [p, c, l] = await Promise.all([loadDeskPrefs(), loadCapabilities(), loadLearning()]);
      if (cancelled) return;
      /* The shipped watch defaults are written down on first load, so what the
         gear shows is what is actually in force. */
      if (p) setPrefs(await ensureWatchDefaults(p.prefs));
      setCaps(c);
      setLearning(l);
    })();
    return () => { cancelled = true; };
  }, [open]);


  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const available = (o: WatchOption) => !o.needs || caps[o.needs];

  const toggle = async (o: WatchOption) => {
    const next = !isOn(prefs, o.key);
    setPrefs(p => ({ ...p, watch: { ...(p.watch || {}), [o.key]: next } }));
    const stored = await saveDeskPrefs(prefs, { watch: { [o.key]: next } });
    setPrefs(stored);
  };

  const togglePanel = async (key: string) => {
    const next = !panelOn(prefs, key);
    setPrefs(p => ({ ...p, panel: { ...(p.panel || {}), [key]: next } }));
    const stored = await saveDeskPrefs(prefs, { panel: { [key]: next } });
    setPrefs(stored);
  };

  const onCount = WATCH_OPTIONS.filter(o => available(o) && isOn(prefs, o.key)).length;

  const groups: WatchOption["group"][] = ["morning", "weekly", "conditional"];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What your Desk watches"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10001, background: "rgba(15,21,25,.34)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: SANS,
      }}
    >
      <div style={{
        width: "min(560px, 100vw)", maxHeight: "88vh", overflowY: "auto",
        background: WHITE, borderRadius: "18px 18px 0 0", border: `1px solid ${LINE}`,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px 12px",
          borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, background: WHITE,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: INK }}>What your Desk watches</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>
              {onCount === 1 ? "One on now." : `${onCount} on now.`} Change any of it whenever you like.
            </p>
          </div>
          <button
            type="button"
            className="ask-focusable"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: 0, background: "transparent",
              color: MUTED, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          ><X size={17} aria-hidden="true" /></button>
        </div>

        {groups.map(g => (
          <section key={g} style={{ padding: "14px 20px 4px" }}>
            <h3 style={{
              margin: "0 0 6px", fontSize: 10.5, letterSpacing: ".12em",
              textTransform: "uppercase", color: MUTED, fontWeight: 600,
            }}>{GROUP_TITLES[g]}</h3>
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
              {WATCH_OPTIONS.filter(o => o.group === g).map((o, i) => {
                const usable = available(o);
                return (
                  <div key={o.key} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                    background: usable ? WHITE : CANVAS,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: usable ? INK : MUTED }}>{o.title}</div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                        {usable ? o.line : MISSING_REASON[o.needs!]}
                      </div>
                      {!usable && o.needs === "linkedin_profile" && (
                        <button
                          type="button"
                          className="ask-focusable"
                          onClick={() => { onClose(); onAddLinkedIn(); }}
                          style={{
                            marginTop: 8, background: "transparent", border: `1px solid ${BLUE}`,
                            color: BLUE, borderRadius: 8, padding: "5px 10px",
                            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                          }}
                        >Add it</button>
                      )}
                    </div>
                    <Toggle
                      on={usable && isOn(prefs, o.key)}
                      disabled={!usable}
                      label={o.title}
                      onChange={() => { if (usable) void toggle(o); }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* The panel beside his answers is his to shape, section by section. */}
        <section style={{ padding: "14px 20px 4px" }}>
          <h3 style={{
            margin: "0 0 6px", fontSize: 10.5, letterSpacing: ".12em",
            textTransform: "uppercase", color: MUTED, fontWeight: 600,
          }}>What shows beside your answers</h3>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
            {PANEL_OPTIONS.map((o, i) => (
              <div key={o.key} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                borderTop: i === 0 ? "none" : `1px solid ${LINE}`, background: WHITE,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{o.line}</div>
                </div>
                <Toggle
                  on={panelOn(prefs, o.key)}
                  label={o.title}
                  onChange={() => void togglePanel(o.key)}
                />
              </div>
            ))}
          </div>
        </section>

        <div style={{ height: 18 }} />
      </div>
    </div>,
    document.body,
  );
}
