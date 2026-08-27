import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildMirror, weekKey, type MirrorClaim } from "./mirror";
import { loadDeskPrefs, saveDeskPrefs, isOn, type DeskPrefs } from "./deskPrefs";
import { createDeskDraft, undoDeskDraft } from "./deskDraft";

/**
 * DeskMirror — a weekly card that TAKES OVER the opener slot on the day it
 * fires. Two voices on one screen means neither is heard, so the parent
 * renders either this or the opener, never both.
 *
 * Fridays, once a week, only when the watch list says so. If no claim can be
 * made with a real count behind it, this renders nothing and the ordinary
 * opener runs instead — a correct outcome, not a failure.
 */

const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";

const FIRED_KEY = "aura.desk.mirror.fired";

interface Props {
  /** Told the truth: whether a Mirror is on screen, so the opener stands aside. */
  onDecided: (showing: boolean) => void;
  onOpenDraft: (draftId: string) => void;
}

function alreadyFired(key: string): boolean {
  try { return localStorage.getItem(FIRED_KEY) === key; } catch { return false; }
}
function markFired(key: string) {
  try { localStorage.setItem(FIRED_KEY, key); } catch { /* it may fire twice; harmless */ }
}

export default function DeskMirror({ onDecided, onOpenDraft }: Props) {
  const [claim, setClaim] = useState<MirrorClaim | null>(null);
  const [prefs, setPrefs] = useState<DeskPrefs | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ id: string; line: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const { week, key } = weekKey(now);
      /* Fridays only, once per week. */
      if (now.getDay() !== 5 || alreadyFired(key)) { onDecided(false); return; }

      const loaded = await loadDeskPrefs();
      if (cancelled) return;
      if (!loaded || !isOn(loaded.prefs, "mirror")) { onDecided(false); return; }

      const uid = loaded.userId;
      const [entRes, postRes] = await Promise.all([
        supabase.from("entries").select("title, summary").eq("user_id", uid).limit(500),
        supabase.from("linkedin_posts").select("post_text, hook").eq("user_id", uid)
          .neq("tracking_status", "draft").limit(500),
      ]);
      if (cancelled) return;

      const built = buildMirror({
        entries: ((entRes.data as any[]) || []).map(r => `${r.title || ""} ${r.summary || ""}`),
        posts: ((postRes.data as any[]) || []).map(r => `${r.post_text || ""} ${r.hook || ""}`),
        dismissed: (loaded.prefs as any).mirror_dismissed || [],
        week,
      });
      if (!built) { onDecided(false); return; }
      markFired(key);
      setPrefs(loaded.prefs);
      setClaim(built);
      onDecided(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!claim || gone) return null;

  /* "Not true" writes back. The same claim never surfaces again. */
  const notTrue = async () => {
    const current = prefs || {};
    const list: string[] = Array.isArray((current as any).mirror_dismissed) ? (current as any).mirror_dismissed : [];
    if (!list.includes(claim.signature)) {
      await saveDeskPrefs(current, { mirror_dismissed: [...list, claim.signature] } as any);
    }
    setGone(true);
    onDecided(false);
  };

  const draftIt = async () => {
    setBusy(true);
    const id = await createDeskDraft({
      opening: claim.sentences.join(" "),
      gapLine: claim.gapLine,
      subject: claim.term,
      missing: "It needs your own number on the line marked below. I could not source that one.",
    });
    setBusy(false);
    if (!id) return;
    setUndo({ id, line: claim.gapLine });
    onOpenDraft(id);
  };

  return (
    <div style={{
      maxWidth: 620, marginTop: 24, background: WHITE,
      border: `1px solid ${LINE}`, borderRadius: 16, padding: 18,
    }}>
      <div style={{
        fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase",
        color: MUTED, marginBottom: 8,
      }}>
        {claim.face === "apart" ? "What sets you apart" : "What you didn't say"}
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: INK }}>
        {claim.sentences.join(" ")}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          className="ask-focusable"
          disabled={busy}
          onClick={() => void draftIt()}
          style={{
            background: BLUE, border: 0, color: "#FFFFFF", borderRadius: 999,
            padding: "8px 15px", fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer",
            minHeight: 40,
          }}
        >{claim.actionLabel}</button>
        <button
          type="button"
          className="ask-focusable"
          onClick={() => void notTrue()}
          style={{
            background: "transparent", border: 0, color: MUTED,
            padding: "8px 10px", fontSize: 12.5, cursor: "pointer", minHeight: 40,
          }}
        >Not true</button>
      </div>
      {undo && (
        <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: MUTED }}>
          Draft made, nothing published.{" "}
          <button
            type="button"
            className="ask-focusable"
            onClick={() => { void undoDeskDraft(undo.id); setUndo(null); }}
            style={{ background: "transparent", border: 0, color: BLUE, fontWeight: 600, cursor: "pointer" }}
          >Undo</button>
        </div>
      )}
    </div>
  );
}
