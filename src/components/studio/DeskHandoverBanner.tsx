import { useEffect, useState } from "react";
import { readHandover, dismissHandover, GAP_MARK } from "@/components/desk/deskDraft";

/**
 * DeskHandoverBanner — an unexplained navigation is the most disorienting
 * thing an agent can do. When the Desk routed him here, the draft says so at
 * the top: what happened, and what is still missing.
 *
 * Once per draft. Dismissing removes the record, so it never returns for
 * that piece.
 */

const CYAN = "#E8F8F7";
const CYAN_LINE = "#BFEDEB";
const AMBER = "#E0A82E";
const INK = "#0F1519";
const MUTED = "#5B6673";

interface Props {
  draftId: string | null;
  /** The words on screen, so the marked hole is shown from the real body. */
  body: string;
}

/** The line the Desk could not write. Only he can. */
export function markedHole(body: string): string | null {
  const line = String(body || "").split("\n").map(l => l.trim()).find(l => l.includes(GAP_MARK));
  return line || null;
}

export default function DeskHandoverBanner({ draftId, body }: Props) {
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    if (!draftId) { setMissing(null); return; }
    setMissing(readHandover(draftId)?.missing ?? null);
  }, [draftId]);

  const hole = markedHole(body);
  if (!missing && !hole) return null;

  return (
    <div style={{ margin: "0 0 12px" }}>
      {missing && draftId && (
        <div style={{
          background: CYAN, border: `1px solid ${CYAN_LINE}`, borderRadius: 12,
          padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: 600, color: INK }}>
              Your Desk brought you here.
            </p>
            <p style={{ margin: "4px 0 0", fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.6, color: MUTED }}>
              {missing}
            </p>
          </div>
          <button
            type="button"
            className="v23-focus"
            onClick={() => { dismissHandover(draftId); setMissing(null); }}
            style={{
              background: "transparent", border: 0, color: MUTED, cursor: "pointer",
              fontFamily: "var(--ff-ui)", fontSize: 12.5, minHeight: 44, padding: "0 4px",
            }}
          >Got it</button>
        </div>
      )}
      {hole && (
        <div style={{
          marginTop: missing ? 10 : 0,
          borderLeft: `3px solid ${AMBER}`, background: "var(--surface-subtle)",
          borderRadius: "0 8px 8px 0", padding: "10px 12px",
        }}>
          <p style={{
            margin: 0, fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.7, color: INK,
          }}>{hole}</p>
          <p style={{ margin: "4px 0 0", fontFamily: "var(--ff-ui)", fontSize: 11.5, color: MUTED }}>
            Only you can fill this line.
          </p>
        </div>
      )}
    </div>
  );
}
