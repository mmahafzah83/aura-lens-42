// "Draft this from what I've already written" — three options for the member's
// headline or About, written from their own posts. Copy only; nothing is applied
// automatically, and nothing is invented.
//
// Every style constant is at MODULE scope, before any use.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const INK = "#0F1519";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";
const CARD = "#FFFFFF";
const CANVAS = "#F2F5F9";
const ACT = "#0670C4";
const ERROR = "#C0392B";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const SANS = "Inter, system-ui, sans-serif";
const ARABIC = "'Cairo', Inter, sans-serif";

const SCRIM: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,21,25,0.45)",
  zIndex: 1000, display: "flex",
};
const PANEL_BASE: React.CSSProperties = {
  background: CANVAS,
  fontFamily: SANS,
  color: INK,
  display: "flex",
  flexDirection: "column",
  maxHeight: "100%",
  overflowY: "auto",
};
const HEAD: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", justifyContent: "space-between",
  gap: 12, padding: "18px 18px 0",
};
const TITLE: React.CSSProperties = { fontSize: 18, fontWeight: 700, lineHeight: 1.3, margin: 0 };
const SUBLINE: React.CSSProperties = { fontSize: 13, color: MUTED, lineHeight: 1.55, margin: "6px 18px 0" };
const BODY: React.CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const OPTION_CARD: React.CSSProperties = {
  background: CARD, border: `1px solid ${LINE}`, borderRadius: 20, padding: 18,
  display: "flex", flexDirection: "column", gap: 10,
};
const COUNT_LINE: React.CSSProperties = { fontFamily: MONO, fontSize: 12, color: MUTED };
const ANGLE_CHIP: React.CSSProperties = {
  alignSelf: "flex-start", borderRadius: 4, padding: "3px 8px",
  background: CARD, border: `1px solid ${LINE}`, color: MUTED,
  fontSize: 11.5, fontFamily: SANS, textTransform: "uppercase", letterSpacing: ".06em",
};
const ANGLE_HINT: React.CSSProperties = { fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: "6px 18px 0" };
const WHY_LINE: React.CSSProperties = { fontSize: 12.5, color: MUTED, lineHeight: 1.5 };
const QUIET_ACTION: React.CSSProperties = {
  alignSelf: "flex-start", background: "none", border: 0, padding: "10px 0",
  minHeight: 44, color: ACT, fontSize: 13.5, fontFamily: SANS, cursor: "pointer",
};
const PRIMARY_BTN: React.CSSProperties = {
  minHeight: 44, padding: "0 18px", borderRadius: 8,
  border: `1px solid ${ACT}`, background: ACT, color: "#FFFFFF",
  fontSize: 13.5, fontWeight: 600, fontFamily: SANS, cursor: "pointer",
};
const CLOSE_BTN: React.CSSProperties = {
  background: "none", border: 0, color: MUTED, cursor: "pointer",
  minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const NOTE_CARD: React.CSSProperties = {
  background: CARD, border: `1px solid ${LINE}`, borderRadius: 20, padding: 18,
};
const NOTE_HEAD: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.4 };
const NOTE_BODY: React.CSSProperties = { fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: "8px 0 0" };
const ERROR_LINE: React.CSSProperties = { fontSize: 13, color: ERROR, lineHeight: 1.5 };
const HONEST_LINE: React.CSSProperties = { fontSize: 13, color: MUTED, lineHeight: 1.6 };
const PROGRESS_TRACK: React.CSSProperties = {
  height: 4, borderRadius: 999, background: LINE, overflow: "hidden", marginBlockStart: 10,
};
const PROGRESS_FILL: React.CSSProperties = {
  height: "100%", borderRadius: 999, background: "#00CEC9",
  animation: "aura-draft-progress 2.4s ease-in-out infinite",
};
const KEYFRAMES = `@keyframes aura-draft-progress {
  0% { margin-inline-start: 0%; width: 18%; }
  50% { margin-inline-start: 60%; width: 40%; }
  100% { margin-inline-start: 0%; width: 18%; }
}`;

export type DraftTarget = "headline" | "about";

interface Option { text: string; why: string; angle?: string }

interface Props {
  target: DraftTarget;
  open: boolean;
  onClose: () => void;
  /** LinkedIn handle, when the member has one on file. */
  handle?: string | null;
  /** Re-runs the LinkedIn read from the panel behind this drawer. */
  onReadAgain?: () => void;
}

const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default function DraftProfileCopy({ target, open, onClose, handle, onReadAgain }: Props) {
  const [phase, setPhase] = useState<"reading" | "writing" | "done">("reading");
  const [options, setOptions] = useState<Option[]>([]);
  const [thin, setThin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const run = useCallback(async () => {
    setPhase("reading");
    setOptions([]);
    setThin(null);
    setError(null);
    const toWriting = window.setTimeout(() => setPhase("writing"), 1200);
    timers.current.push(toWriting);
    try {
      const { data, error: err } = await supabase.functions.invoke("draft-profile-copy", {
        body: { target },
      });
      if (err) throw new Error("Aura couldn't write just now. Try again.");
      const res = data as {
        ok?: boolean; reason?: string; posts_found?: number;
        options?: Option[]; error?: string;
      } | null;
      if (res?.ok && Array.isArray(res.options) && res.options.length > 0) {
        setOptions(res.options);
      } else if (res?.reason === "not_enough_writing") {
        setThin(typeof res.posts_found === "number" ? res.posts_found : 0);
      } else if (res?.reason === "unreadable_response") {
        setError("Aura's answer came back garbled. Try again.");
      } else {
        setError(res?.error || "Aura couldn't write just now. Try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Aura couldn't write just now. Try again.");
    } finally {
      window.clearTimeout(toWriting);
      setPhase("done");
    }
  }, [target]);

  useEffect(() => {
    if (!open) return;
    void run();
  }, [open, run]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const copy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      const t = window.setTimeout(() => setCopied(null), 2000);
      timers.current.push(t);
    } catch {
      setError("Couldn't reach your clipboard. Select the text and copy it by hand.");
    }
  };

  if (!open) return null;

  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  const panelStyle: React.CSSProperties = wide
    ? { ...PANEL_BASE, marginInlineStart: "auto", width: 520, maxWidth: "100%", height: "100%", borderStartStartRadius: 12, borderEndStartRadius: 12 }
    : { ...PANEL_BASE, marginBlockStart: "auto", width: "100%", maxHeight: "92%", borderStartStartRadius: 20, borderStartEndRadius: 20 };

  const busy = phase !== "done";

  return createPortal(
    <div
      style={SCRIM}
      role="dialog"
      aria-modal="true"
      aria-label={target === "headline" ? "Draft a headline" : "Draft an About section"}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{KEYFRAMES}</style>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={HEAD}>
          <h2 style={TITLE}>
            {target === "headline"
              ? "A sharper headline, from your own posts"
              : "An About section, from your own posts"}
          </h2>
          <button type="button" style={CLOSE_BTN} aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p style={SUBLINE}>
          Aura reads what you've published and writes in that voice. Nothing here is invented.
        </p>
        <p style={ANGLE_HINT}>
          Three angles on the same person. Pick the one that sounds like you.
        </p>

        <div style={BODY}>
          {busy && (
            <div style={NOTE_CARD}>
              <p style={NOTE_HEAD}>{phase === "reading" ? "Reading your posts…" : "Writing three options…"}</p>
              <p style={NOTE_BODY}>This takes up to a minute. You can close this and come back.</p>
              <div style={PROGRESS_TRACK}><div style={PROGRESS_FILL} /></div>
            </div>
          )}

          {!busy && thin !== null && (
            <div style={NOTE_CARD}>
              <p style={NOTE_HEAD}>Aura hasn't read enough of your writing yet.</p>
              <p style={NOTE_BODY}>
                It found <span style={{ fontFamily: MONO }}>{thin}</span> of your posts. It needs at least{" "}
                <span style={{ fontFamily: MONO }}>3</span> before it can sound like you.
              </p>
              {onReadAgain && (
                <button
                  type="button"
                  style={QUIET_ACTION}
                  onClick={() => { onClose(); onReadAgain(); }}
                >
                  Read my posts again →
                </button>
              )}
            </div>
          )}

          {!busy && error && (
            <div style={NOTE_CARD}>
              <div style={ERROR_LINE}>{error}</div>
              <button type="button" style={QUIET_ACTION} onClick={() => void run()}>Try again</button>
            </div>
          )}

          {!busy && options.map((o, i) => {
            const ar = isArabic(o.text);
            return (
              <div key={`${i}-${o.text.slice(0, 24)}`} style={OPTION_CARD}>
                {o.angle && <span style={ANGLE_CHIP}>{o.angle}</span>}
                <div
                  dir="auto"
                  style={{
                    fontSize: 14.5,
                    lineHeight: ar ? 1.9 : 1.65,
                    fontFamily: ar ? ARABIC : SANS,
                    color: INK,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {o.text}
                </div>
                <div style={COUNT_LINE}>
                  {target === "headline"
                    ? `${o.text.length} characters`
                    : `${wordCount(o.text)} words`}
                </div>
                {o.why && <div dir="auto" style={WHY_LINE}>{o.why}</div>}
                <button type="button" style={QUIET_ACTION} onClick={() => void copy(o.text, i)}>
                  {copied === i ? "Copied" : "Copy"}
                </button>
              </div>
            );
          })}

          {!busy && options.length > 0 && (
            <>
              <div style={HONEST_LINE}>
                Aura can't edit LinkedIn for you. Copy the one you want and paste it in.
              </div>
              {handle && (
                <a
                  href={`https://www.linkedin.com/in/${handle}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...QUIET_ACTION, textDecoration: "none" }}
                >
                  Open my LinkedIn profile →
                </a>
              )}
              <div>
                <button type="button" style={PRIMARY_BTN} onClick={() => void run()}>
                  Write three more
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}