import { useEffect, useState } from "react";
import {
  PRIORITY_CHIPS, PRIORITY_REPLY, PRIORITY_WATCH, WATCH_OPTIONS,
  loadDeskPrefs, saveDeskPrefs, type DeskPriority, type DeskPrefs,
} from "./deskPrefs";

/**
 * The one question the Desk asks, once.
 *
 * It is asked at the top of the surface, answered in one tap, and never asked
 * again. The answer is agreed with plainly and priced honestly — no praise —
 * and it retunes what the Desk watches immediately.
 */

const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";
const SANS = "Inter, system-ui, sans-serif";

interface Props {
  /** Opens the gear so he can see what changed. */
  onOpenWatch: () => void;
  /** Told once, when the answer is stored — the slot then returns to the opener. */
  onAnswered?: () => void;
}

export default function DeskPriorityAsk({ onOpenWatch, onAnswered }: Props) {
  const [prefs, setPrefs] = useState<DeskPrefs | null>(null);
  const [justChose, setJustChose] = useState<DeskPriority | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadDeskPrefs();
      if (!cancelled) setPrefs(p ? p.prefs : {});
    })();
    return () => { cancelled = true; };
  }, []);

  if (!prefs) return null;
  /* Answered on an earlier visit: the question is finished with. */
  if (prefs.priority && !justChose) return null;

  const choose = async (key: DeskPriority) => {
    setJustChose(key);
    const wanted = PRIORITY_WATCH[key];
    const watch: Record<string, boolean> = {};
    for (const o of WATCH_OPTIONS) watch[o.key] = wanted.includes(o.key);
    const stored = await saveDeskPrefs(prefs, { priority: key, watch });
    setPrefs(stored);
    onAnswered?.();
  };

  return (
    <div style={{
      maxWidth: 620, marginTop: 12, background: WHITE, border: `1px solid ${LINE}`,
      borderRadius: 16, padding: 16, fontFamily: SANS,
    }}>
      {justChose ? (
        <>
          <p style={{ margin: 0, fontSize: 14, color: INK, lineHeight: 1.6 }}>{PRIORITY_REPLY[justChose]}</p>
          <button
            type="button"
            className="ask-focusable"
            onClick={onOpenWatch}
            style={{
              marginTop: 12, background: "transparent", border: `1px solid ${LINE}`,
              color: INK, borderRadius: 9, padding: "8px 12px",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >See what I'll watch</button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.6 }}>
            What matters most to you right now?
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: MUTED }}>
            One tap. It tunes what I watch, and you can change it later.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {PRIORITY_CHIPS.map(c => (
              <button
                key={c.key}
                type="button"
                className="ask-focusable"
                onClick={() => void choose(c.key)}
                style={{
                  background: "transparent", border: `1px solid ${BLUE}`, color: BLUE,
                  borderRadius: 999, padding: "7px 13px", fontSize: 12.5,
                  fontWeight: 600, cursor: "pointer",
                }}
              >{c.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
