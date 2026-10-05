// "Draft this from what I've already written" — three options for the member's
// headline or About, written from their own posts. Copy only; nothing is applied
// automatically, and nothing is invented.
//
// Every style constant is at MODULE scope, before any use.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { WorkingInline } from "@/components/ui/WorkingPanel";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { displayDate, AR_TEXT } from "@/lib/arDisplay";

const INK = "#0F1519";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";
const CARD = "#FFFFFF";
const CANVAS = "#F2F5F9";
const ACT = "#0670C4";
const ERROR = "#C0392B";
/* Cairo second: Plex Mono has no Arabic letters, so Arabic in a mono span falls to Cairo. */
const MONO = "'IBM Plex Mono', 'Cairo', ui-monospace, Menlo, monospace";
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
const CREDIT_LINE: React.CSSProperties = { fontSize: 12.5, color: MUTED, lineHeight: 1.55 };
const CACHE_LINE: React.CSSProperties = { fontSize: 12.5, color: MUTED, lineHeight: 1.55 };
const DROPPED_LINE: React.CSSProperties = { fontSize: 12.5, color: MUTED, lineHeight: 1.55 };
const LANG_ROW: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const LANG_LABEL: React.CSSProperties = { fontSize: 12.5, color: MUTED };
const SEGMENT: React.CSSProperties = {
  display: "inline-flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", background: CARD,
};
const SEG_BTN = (on: boolean): React.CSSProperties => ({
  minHeight: 44, padding: "0 16px", border: 0, cursor: "pointer",
  background: on ? ACT : CARD, color: on ? "#FFFFFF" : MUTED,
  fontSize: 13.5, fontWeight: 600, fontFamily: SANS,
});
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
const formatDate = (iso: string, lang: string) => {
  const d = new Date(iso);
  if (lang === "ar") return Number.isNaN(d.getTime()) ? "—" : displayDate(iso, lang);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function DraftProfileCopy({ target, open, onClose, handle, onReadAgain }: Props) {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language;
  const uiAr = lang === "ar";
  const A = (s: React.CSSProperties): React.CSSProperties => (uiAr ? { ...s, ...AR_TEXT } : s);
  const [phase, setPhase] = useState<"reading" | "writing" | "done">("reading");
  const [options, setOptions] = useState<Option[]>([]);
  const [thin, setThin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [dropped, setDropped] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [writtenAt, setWrittenAt] = useState<string | null>(null);
  const [language, setLanguage] = useState<"ar" | "en">("en");
  const [stale, setStale] = useState(false);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [mixed, setMixed] = useState(false);
  const [wide, setWide] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );
  const timers = useRef<number[]>([]);

  const run = useCallback(async (mode: "cached" | "fresh", lang?: "ar" | "en") => {
    setPhase("reading");
    setOptions([]);
    setThin(null);
    setError(null);
    setDropped(0);
    setFromCache(false);
    setStale(false);
    setAppliedAt(null);
    const toWriting = window.setTimeout(() => setPhase("writing"), 1200);
    timers.current.push(toWriting);
    try {
      const { data, error: err } = await supabase.functions.invoke("draft-profile-copy", {
        body: { target, mode, ...(mode === "fresh" && lang ? { language: lang } : {}) },
      });
      if (err) throw new Error(tr("dpc.err.write"));
      const res = data as {
        ok?: boolean; reason?: string; posts_found?: number;
        options?: Option[]; error?: string; dropped?: number;
        from_cache?: boolean; written_at?: string;
        language?: string; detected_language?: string;
        stale?: boolean; applied_at?: string | null;
      } | null;
      const detected = res?.detected_language ?? res?.language;
      if (detected === "ar" || detected === "en") setLanguage(detected);
      setMixed(detected === "mixed");
      if (res?.ok && Array.isArray(res.options) && res.options.length > 0) {
        setOptions(res.options);
        setDropped(typeof res.dropped === "number" ? res.dropped : 0);
        setFromCache(Boolean(res.from_cache));
        setWrittenAt(res.written_at ?? null);
        setStale(Boolean(res.stale));
        setAppliedAt(res.applied_at ?? null);
      } else if (res?.reason === "not_enough_writing") {
        setThin(typeof res.posts_found === "number" ? res.posts_found : 0);
      } else if (res?.reason === "unreadable_response") {
        setError(tr("dpc.err.garbled"));
      } else if (res?.reason === "busy") {
        setError(tr("dpc.err.busy"));
      } else if (res?.reason === "no_credits") {
        setError(tr("dpc.err.credits"));
      } else if (res?.reason === "model_failed") {
        setError(tr("dpc.err.write"));
      } else {
        setError(res?.error || tr("dpc.err.write"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : tr("dpc.err.write"));
    } finally {
      window.clearTimeout(toWriting);
      setPhase("done");
    }
  }, [target, tr]);

  useEffect(() => {
    if (!open) return;
    void run("cached");
  }, [open, run]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

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

  /* Copying is the moment the member acts. We record what they took — but we
     do NOT claim they applied it. That is only ever decided by the next read. */
  const recordCopy = async (text: string, angle?: string) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      await supabase
        .from("profile_copy_drafts")
        .update({ copied_at: new Date().toISOString(), copied_text: text, copied_angle: angle ?? null })
        .eq("user_id", uid)
        .eq("target", target);
      await supabase.from("product_events").insert({
        user_id: uid,
        event: "profile_copy_copied",
        props: { target, angle: angle ?? null, characters: text.length },
      });
    } catch {
      /* Telemetry must never break a copy the member already has. */
    }
  };

  const copy = async (text: string, index: number, angle?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      void recordCopy(text, angle);
      const t = window.setTimeout(() => setCopied(null), 2000);
      timers.current.push(t);
    } catch {
      setError(tr("dpc.err.clipboard"));
    }
  };

  if (!open) return null;

  const panelStyle: React.CSSProperties = wide
    ? { ...PANEL_BASE, marginInlineStart: "auto", width: 520, maxWidth: "100%", height: "100%", borderStartStartRadius: 12, borderEndStartRadius: 12 }
    : { ...PANEL_BASE, marginBlockStart: "auto", width: "100%", maxHeight: "92%", borderStartStartRadius: 20, borderStartEndRadius: 20 };

  const busy = phase !== "done";

  return createPortal(
    <div
      style={SCRIM}
      role="dialog"
      aria-modal="true"
      aria-label={target === "headline" ? tr("dpc.ariaHeadline") : tr("dpc.ariaAbout")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={HEAD}>
          <h2 style={A(TITLE)}>
            {target === "headline"
              ? tr("dpc.titleHeadline")
              : tr("dpc.titleAbout")}
          </h2>
          <button type="button" style={CLOSE_BTN} aria-label={tr("dpc.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p style={A(SUBLINE)}>
          {tr("dpc.sub")}
        </p>
        <p style={A(ANGLE_HINT)}>
          {tr("dpc.angles")}
        </p>

        <div style={BODY}>
          {busy && (
            <div style={NOTE_CARD}>
              <p style={A(NOTE_HEAD)}>{phase === "reading" ? tr("dpc.reading") : tr("dpc.writing")}</p>
              <p style={A(NOTE_BODY)}>{tr("dpc.closeBack")}</p>
              <div style={{ marginBlockStart: 10 }}>
                <WorkingInline
                  verb={phase === "reading" ? tr("dpc.reading") : tr("dpc.writing")}
                />
              </div>
            </div>
          )}

          {!busy && thin !== null && (
            <div style={NOTE_CARD}>
              <p style={A(NOTE_HEAD)}>{tr("dpc.thinHead")}</p>
              {uiAr ? (
                <p style={A(NOTE_BODY)}>{tr("dpc.thinBody", { n: thin })}</p>
              ) : (
              <p style={NOTE_BODY}>
                It found <span style={{ fontFamily: MONO }}>{thin}</span> of your posts. It needs at least{" "}
                <span style={{ fontFamily: MONO }}>3</span> before it can sound like you.
              </p>
              )}
              {onReadAgain && (
                <button
                  type="button"
                  style={A(QUIET_ACTION)}
                  onClick={() => { onClose(); onReadAgain(); }}
                >
                  {tr("dpc.readAgain")}
                </button>
              )}
            </div>
          )}

          {!busy && error && (
            <div style={NOTE_CARD}>
              <div style={A(ERROR_LINE)}>{error}</div>
              <button type="button" style={A(QUIET_ACTION)} onClick={() => void run("cached")}>{tr("dpc.tryAgain")}</button>
            </div>
          )}

          {!busy && fromCache && writtenAt && options.length > 0 && (
            <div style={A(CACHE_LINE)}>
              {uiAr ? tr("dpc.writtenOn", { date: formatDate(writtenAt, lang) }) : <>Written on <span style={{ fontFamily: MONO }}>{formatDate(writtenAt, lang)}</span>.</>}
              {stale && tr("dpc.stale")}
            </div>
          )}

          {!busy && appliedAt && options.length > 0 && (
            <div style={A(CACHE_LINE)}>
              {uiAr ? tr("dpc.applied", { date: formatDate(appliedAt, lang) }) : <>KnownBy found one of these on your profile on{" "}
              <span style={{ fontFamily: MONO }}>{formatDate(appliedAt, lang)}</span>.</>}
            </div>
          )}

          {!busy && options.map((o, i) => {
            const ar = isArabic(o.text);
            return (
              <div key={`${i}-${o.text.slice(0, 24)}`} style={OPTION_CARD}>
                {o.angle && <span style={A(ANGLE_CHIP)}>{o.angle}</span>}
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
                    ? tr("dpc.chars", { n: o.text.length })
                    : tr("dpc.words", { n: wordCount(o.text) })}
                </div>
                {o.why && <div dir="auto" style={WHY_LINE}>{o.why}</div>}
                <button type="button" style={A(QUIET_ACTION)} onClick={() => void copy(o.text, i, o.angle)}>
                  {copied === i ? tr("dpc.copied") : tr("dpc.copy")}
                </button>
              </div>
            );
          })}

          {!busy && options.length > 0 && (
            <>
              {dropped > 0 && (
                <div style={A(DROPPED_LINE)}>
                  {uiAr ? tr("dpc.dropped", { n: dropped }) : <><span style={{ fontFamily: MONO }}>{dropped}</span> more didn't meet the bar and weren't shown.</>}
                </div>
              )}
              <div style={A(HONEST_LINE)}>
                {tr("dpc.cantEdit")}
              </div>
              {handle && (
                <a
                  href={`https://www.linkedin.com/in/${handle}`}
                  target="_blank"
                  rel="noreferrer"
                  style={A({ ...QUIET_ACTION, textDecoration: "none" })}
                >
                  {tr("dpc.openLi")}
                </a>
              )}
              <div style={LANG_ROW}>
                <span style={A(LANG_LABEL)}>{tr("dpc.writeIn")}</span>
                <div style={SEGMENT} role="group" aria-label={tr("dpc.writeIn")}>
                  <button type="button" style={SEG_BTN(language === "en")} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
                  <button type="button" style={SEG_BTN(language === "ar")} aria-pressed={language === "ar"} onClick={() => setLanguage("ar")}>العربية</button>
                </div>
              </div>
              {mixed && <div style={A(CREDIT_LINE)}>{tr("dpc.mixed")}</div>}
              <div>
                <button type="button" style={A(PRIMARY_BTN)} onClick={() => void run("fresh", language)}>
                  {tr("dpc.writeNew")}
                </button>
                <div style={A({ ...CREDIT_LINE, marginBlockStart: 8 })}>
                  {tr("dpc.credit")}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}