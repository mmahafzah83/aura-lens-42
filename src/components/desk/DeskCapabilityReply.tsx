import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DeskLinkedInField from "./DeskLinkedInField";
import {
  declinePatch, loadDeskPrefs, saveDeskPrefs, type CapabilityKey, type DeskPrefs,
} from "./deskPrefs";

/**
 * The honest refusal.
 *
 * Four lines, in order: what he asked for, why it cannot happen yet, the
 * nearest true thing that can, and the one field that would fix it. "Later"
 * is a real answer — the ask goes quiet for thirty days and the date is kept
 * so nothing asks again by accident.
 */

const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";
const SANS = "Inter, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const CANNOT: Record<CapabilityKey, string> = {
  linkedin_profile: "I can't read your profile — nothing is connected to read.",
  cv_crosscheck: "I can't compare it against your record — there's no CV on file.",
};

interface Props {
  capability: CapabilityKey;
  /** Runs when the capability becomes true, so the original ask can be answered. */
  onReady: () => void;
  /** Runs when he takes the nearest true thing instead. */
  onInstead: (prompt: string) => void;
  onDismiss: () => void;
}

export default function DeskCapabilityReply({ capability, onReady, onInstead, onDismiss }: Props) {
  const [prefs, setPrefs] = useState<DeskPrefs>({});
  const [published, setPublished] = useState<number | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadDeskPrefs();
      if (cancelled) return;
      if (p) {
        setPrefs(p.prefs);
        const { count } = await supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.userId)
          .eq("tracking_status", "published");
        if (!cancelled) setPublished(count ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const later = async () => {
    const stored = await saveDeskPrefs(prefs, declinePatch(capability));
    setPrefs(stored);
    onDismiss();
  };

  const nearest = published && published > 0
    ? `While you're here: I can tell you what your ${published} published ${published === 1 ? "post says" : "posts say"} about you.`
    : null;

  return (
    <div style={{
      maxWidth: 620, marginTop: 12, background: WHITE, border: `1px solid ${LINE}`,
      borderRadius: 16, padding: 16, fontFamily: SANS,
    }}>
      <p style={{ margin: 0, fontSize: 14, color: INK, lineHeight: 1.6 }}>{CANNOT[capability]}</p>
      {nearest && (
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: MUTED, lineHeight: 1.6 }}>
          {nearest.split(/(\d[\d,]*)/).map((part, i) =>
            /^\d/.test(part)
              ? <span key={i} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: INK }}>{part}</span>
              : <span key={i}>{part}</span>)}
        </p>
      )}

      {fieldOpen && capability === "linkedin_profile" ? (
        <DeskLinkedInField onSaved={onReady} onCancel={() => setFieldOpen(false)} />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {capability === "linkedin_profile" && (
            <button
              type="button"
              className="ask-focusable"
              onClick={() => setFieldOpen(true)}
              style={{
                border: 0, background: BLUE, color: WHITE, borderRadius: 9,
                padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >Add it now</button>
          )}
          {nearest && (
            <button
              type="button"
              className="ask-focusable"
              onClick={() => onInstead("What do my published posts say about me?")}
              style={{
                background: "transparent", border: `1px solid ${LINE}`, color: INK,
                borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >Do that instead</button>
          )}
          <button
            type="button"
            className="ask-focusable"
            onClick={() => void later()}
            style={{
              background: "transparent", border: 0, color: MUTED,
              borderRadius: 9, padding: "8px 10px", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >Later</button>
        </div>
      )}
    </div>
  );
}
