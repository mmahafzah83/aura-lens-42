import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * DeskLedger — four rows, ordered by neglect. The most overdue thing first.
 *
 * Every number is read from a real row. A row with no data is omitted; it is
 * never rendered as a zero or an em dash. Only the top row — the one thing
 * that asks something of him — carries buttons.
 */

/* System-B, literal. */
const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";
const AMBER_TEXT = "#9A6F12";
const AMBER_GROUND = "#FDF8EC";
const GREEN = "#12805C";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const SNOOZE_KEY = "aura.desk.draft.snoozed";

interface Row {
  key: "draft" | "signals" | "presence" | "vault";
  id?: string;
  title: string;
  subtitle: string;
  value: string;
  /** Empty when the value is a word ("Today") rather than a number. */
  unit: string;
  colour: string;
  /** Days the row has genuinely been waiting. Higher waits longer. */
  neglect: number;
  open: () => void;
}


interface Props {
  onOpenDrafts: () => void;
  onOpenSignals: () => void;
  onOpenTab: (tab: string) => void;
}

function snoozedDraftId(): string | null {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id: string; until: number };
    return v && v.until > Date.now() ? v.id : null;
  } catch { return null; }
}

export default function DeskLedger({ onOpenDrafts, onOpenSignals, onOpenTab }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [snoozed, setSnoozed] = useState<string | null>(() => snoozedDraftId());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const [draftRes, sigRes, snapRes, vaultRes, pillarRes] = await Promise.all([
        supabase.from("linkedin_posts")
          .select("id, created_at, hook, post_text")
          .eq("user_id", uid).eq("tracking_status", "draft")
          .order("created_at", { ascending: false }).limit(1),
        supabase.from("strategic_signals")
          .select("id, theme_tags, created_at").eq("user_id", uid).eq("status", "active"),

        supabase.from("score_snapshots")
          .select("score, created_at").eq("user_id", uid)
          .order("created_at", { ascending: false }).limit(2),
        supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("entries").select("skill_pillar").eq("user_id", uid).not("skill_pillar", "is", null),
      ]);
      if (cancelled) return;

      const out: Row[] = [];

      /* Tuesday's draft — the newest thing left unfinished. */
      const draft = ((draftRes.data as any[]) || [])[0];
      if (draft && draft.id !== snoozed) {
        const days = Math.max(0, Math.floor((Date.now() - new Date(draft.created_at).getTime()) / 86_400_000));
        const body = String(draft.post_text || "");
        const why = !body.trim()
          ? "Nothing written yet"
          : !String(draft.hook || "").trim()
            ? "No opening line chosen"
            : body.length < 400
              ? "Stopped part way through"
              : "Written, never sent";
        out.push({
          key: "draft",
          id: String(draft.id),
          title: new Date(draft.created_at).toLocaleDateString(undefined, { weekday: "long" }) + "'s draft",
          subtitle: why,
          /* A zero is not a number worth showing — it is a different sentence. */
          value: days === 0 ? "Today" : String(days),
          unit: days === 0 ? "" : days === 1 ? "day idle" : "days idle",
          colour: days >= 7 ? AMBER_TEXT : INK,
          neglect: days,
          open: onOpenDrafts,
        });
      }

      /* New signals — how many touch his strongest pillar. */
      const sigs = ((sigRes.data as any[]) || []);
      if (sigs.length) {
        const counts = new Map<string, number>();
        for (const e of ((pillarRes.data as any[]) || [])) {
          const p = String(e.skill_pillar || "").trim();
          if (p) counts.set(p, (counts.get(p) || 0) + 1);
        }
        const topPillar = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const touching = topPillar
          ? sigs.filter(s => (Array.isArray(s.theme_tags) ? s.theme_tags : [])
              .some((t: string) => String(t || "").toLowerCase().includes(topPillar.toLowerCase())
                || topPillar.toLowerCase().includes(String(t || "").toLowerCase()))).length
          : 0;
        /* Neglect is how long the oldest unread signal has sat, not how many there are. */
        const oldestSig = sigs
          .map(s => new Date(s.created_at).getTime())
          .filter(n => Number.isFinite(n))
          .sort((a, b) => a - b)[0];
        const sigDays = oldestSig
          ? Math.max(0, Math.floor((Date.now() - oldestSig) / 86_400_000))
          : 0;
        out.push({
          key: "signals",
          title: "New signals",
          subtitle: topPillar && touching > 0
            ? `${touching} touch ${topPillar}`
            : "Waiting to be read",
          value: String(sigs.length),
          unit: "unread",
          colour: INK,
          neglect: sigDays,
          open: onOpenSignals,
        });
      }

      /* Your presence — the move between the last two readings, newest first. */
      const snaps = ((snapRes.data as any[]) || [])
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (snaps.length === 2 && typeof snaps[0].score === "number" && typeof snaps[1].score === "number") {
        const delta = snaps[0].score - snaps[1].score;
        out.push({
          key: "presence",
          title: "Your presence",
          subtitle: "Moved this week",
          value: delta === 0 ? "Steady" : `${delta > 0 ? "+" : ""}${delta}`,
          unit: delta === 0 ? "" : "points",
          colour: delta > 0 ? GREEN : INK,
          /* Presence and the vault never wait on him; they sit below anything that does. */
          neglect: 0.5,
          open: () => onOpenTab("influence"),
        });
      }

      /* Your vault — everything he has kept. */
      const vault = vaultRes.count ?? 0;
      if (vault > 0) {
        out.push({
          key: "vault",
          title: "Your vault",
          subtitle: "Ask it anything",
          value: String(vault),
          unit: "saved",
          colour: INK,
          neglect: 0.1,
          open: () => onOpenTab("record"),
        });
      }

      out.sort((a, b) => b.neglect - a.neglect);

      setRows(out.slice(0, 4));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snoozed]);

  if (!rows || !rows.length) return null;

  const notThisWeek = (id: string) => {
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify({ id, until: Date.now() + 7 * 86_400_000 }));
    } catch { /* a refused store simply means the row returns next visit */ }
    setSnoozed(id);
  };

  return (
    <div style={{
      maxWidth: 620, marginTop: 14, background: WHITE,
      border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden",
    }}>
      {rows.map((r, i) => {
        const isTop = i === 0;
        const amber = r.colour === AMBER_TEXT;
        return (
          <div key={r.key} style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}` }}>
            <button
              type="button"
              className="ask-focusable"
              onClick={r.open}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                background: "transparent", border: 0, cursor: "pointer",
                padding: "14px 16px", textAlign: "start", minHeight: 44,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: INK }}>{r.title}</span>
                <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2 }}>{r.subtitle}</span>
              </span>
              <span style={{ textAlign: "end", flex: "0 0 auto" }}>
                <span style={{
                  display: "block", fontFamily: MONO, fontVariantNumeric: "tabular-nums",
                  fontSize: 18, fontWeight: 600, color: r.colour, lineHeight: 1.1,
                }}>{r.value}</span>
                {r.unit && (
                  <span style={{
                    display: "block", fontSize: 9.5, letterSpacing: ".12em",
                    textTransform: "uppercase", color: MUTED, marginTop: 3,
                  }}>{r.unit}</span>
                )}

              </span>
            </button>

            {isTop && r.key === "draft" && (
              <div style={{
                display: "flex", gap: 8, padding: "10px 16px 12px",
                background: amber ? AMBER_GROUND : "transparent",
              }}>
                <button
                  type="button"
                  className="ask-focusable"
                  onClick={onOpenDrafts}
                  style={{
                    background: "transparent", border: `1px solid ${BLUE}`, color: BLUE,
                    borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}
                >Finish it</button>
                <button
                  type="button"
                  className="ask-focusable"
                  onClick={() => { if (r.id) notThisWeek(r.id); }}
                  style={{
                    background: "transparent", border: 0, color: MUTED,
                    borderRadius: 8, padding: "7px 8px", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                  }}
                >Not this week</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
