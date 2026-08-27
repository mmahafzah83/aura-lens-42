import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveLinkedInAddress } from "@/lib/linkedinAddress";

/**
 * One field, in place. He never leaves the Desk to give an address, and the
 * thing he asked for happens the moment it is saved.
 */

const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";
const RED_TEXT = "#9A2A24";
const SANS = "Inter, system-ui, sans-serif";

interface Props {
  /** Runs after the address is stored, so the original ask can be answered. */
  onSaved: () => void;
  onCancel: () => void;
}

export default function DeskLinkedInField({ onSaved, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error("Sign in again to save this.");
      await saveLinkedInAddress(uid, value);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        marginTop: 10, background: WHITE, border: `1px solid ${LINE}`,
        borderRadius: 14, padding: 14, fontFamily: SANS, maxWidth: 620,
      }}
    >
      <label htmlFor="desk-li" style={{ display: "block", fontSize: 13, fontWeight: 600, color: INK }}>
        Your LinkedIn address
      </label>
      <input
        id="desk-li"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="linkedin.com/in/your-name"
        autoFocus
        style={{
          width: "100%", marginTop: 8, padding: "9px 11px", fontSize: 13.5,
          color: INK, background: WHITE, border: `1px solid ${LINE}`,
          borderRadius: 9, outline: "none", fontFamily: SANS,
        }}
      />
      {error && <p role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: RED_TEXT }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="submit"
          className="ask-focusable"
          disabled={busy || !value.trim()}
          style={{
            border: 0, background: BLUE, color: WHITE, borderRadius: 9,
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            cursor: busy || !value.trim() ? "not-allowed" : "pointer",
            opacity: busy || !value.trim() ? 0.6 : 1,
          }}
        >{busy ? "Saving" : "Save and read it"}</button>
        <button
          type="button"
          className="ask-focusable"
          onClick={onCancel}
          style={{
            border: 0, background: "transparent", color: MUTED, borderRadius: 9,
            padding: "8px 10px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >Cancel</button>
      </div>
    </form>
  );
}
