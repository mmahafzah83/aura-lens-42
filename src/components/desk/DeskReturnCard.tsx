import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AuraMark from "@/components/brand/AuraMark";

/**
 * DeskReturnCard — what he sees when he has been away.
 *
 * It replaces the opener when the last conversation is older than twelve hours
 * (or there has never been one), and only once per session. Two short lines,
 * plain speech, no enthusiasm: a greeting, and the thread we were on.
 *
 * Every word here comes from a real row. If there is no prior conversation the
 * card says so rather than inventing a thread.
 */

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SESSION_KEY = "aura.desk.return.shown";

const INK = "#0F1519";
const MUTED = "#5B6673";
const SANS = "Inter, system-ui, sans-serif";

export interface ReturnCardData {
  greeting: string;
  thread: string;
}

/** Morning / afternoon / evening in HIS timezone, not the server's. */
export function partOfDay(now: Date, timeZone?: string | null): string {
  let hour = now.getHours();
  try {
    if (timeZone) {
      hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now));
    }
  } catch { /* an unknown zone falls back to the browser's */ }
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/**
 * One plain sentence from a stored summary. The stored text is a paragraph of
 * analysis; the card carries only the subject of it.
 */
export function threadLine(summary: string | null | undefined): string {
  const raw = String(summary || "").trim();
  if (!raw) return "This is the first time we have talked.";
  const first = raw.split(/(?<=\.)\s/)[0] || raw;
  let s = first
    .replace(/^[.\s]+/, "")
    .replace(/^(the\s+)?conversation\s+(focused\s+on|centred\s+on|centered\s+on|was\s+about|covered)\s+/i, "")
    .replace(/^(we|you)\s+(were|was)\s+/i, "")
    .replace(/\.$/, "")
    .trim();
  if (!s) return "This is the first time we have talked.";
  if (s.length > 90) s = `${s.slice(0, 90).replace(/\s+\S*$/, "").trim()}`;
  return `Last time we were working on ${s.charAt(0).toLowerCase()}${s.slice(1)}.`;
}

interface Props {
  /** Called once with the verdict: true when this card takes the slot. */
  onReady: (show: boolean, data: ReturnCardData | null) => void;
  onPickUp: () => void;
  onOvernight: () => void;
  onNew: () => void;
  data: ReturnCardData | null;
}

/** Decides, once per session, whether the return card is owed. */
export async function loadReturnCard(): Promise<ReturnCardData | null> {
  try { if (sessionStorage.getItem(SESSION_KEY) === "1") return null; } catch { /* shown every open */ }

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return null;

  const [profRes, memRes] = await Promise.all([
    supabase.from("diagnostic_profiles").select("first_name, timezone").eq("user_id", uid).maybeSingle(),
    supabase.from("aura_conversation_memory")
      .select("summary, created_at").eq("user_id", uid)
      .not("summary", "is", null).order("created_at", { ascending: false }).limit(1),
  ]);

  const prof: any = profRes.data || null;
  const last: any = ((memRes.data as any[]) || [])[0] || null;

  /* Still mid-conversation: he does not need welcoming back. */
  if (last?.created_at && Date.now() - new Date(last.created_at).getTime() < TWELVE_HOURS_MS) return null;

  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* it may show twice; harmless */ }

  const name = String(prof?.first_name || "").trim();
  return {
    greeting: `Good ${partOfDay(new Date(), prof?.timezone)}${name ? `, ${name}` : ""}.`,
    thread: threadLine(last?.summary),
  };
}

export default function DeskReturnCard({ data, onPickUp, onOvernight, onNew, onReady }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (data || ready) return;
    let cancelled = false;
    (async () => {
      const d = await loadReturnCard();
      if (cancelled) return;
      setReady(true);
      onReady(!!d, d);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return null;

  const chip = (label: string, onClick: () => void, primary?: boolean) => (
    <button
      key={label}
      type="button"
      className="ask-focusable ask-chip"
      onClick={onClick}
      style={primary ? {
        background: "var(--act)", border: 0, color: "var(--text-inverse)",
        borderRadius: 999, padding: "7px 14px", fontSize: 12.5, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      } : {
        background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
        borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >{label}<ArrowUpRight size={13} aria-hidden="true" /></button>
  );

  return (
    <div className="ask-answer-card" data-testid="desk-return-card" style={{ maxWidth: 620, marginTop: 24, fontFamily: SANS, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <AuraMark size={64} state="resting" />
      </div>
      <p style={{ margin: 0, fontSize: 15.5, color: INK, lineHeight: 1.6 }}>{data.greeting}</p>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: MUTED, lineHeight: 1.6 }}>{data.thread}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" }}>
        {chip("Pick up where we left off", onPickUp, true)}
        {chip("What came in overnight", onOvernight)}
        {chip("Something new", onNew)}
      </div>
    </div>
  );
}
