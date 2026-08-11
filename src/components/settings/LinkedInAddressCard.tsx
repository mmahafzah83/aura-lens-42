/**
 * Settings → Connections: the one place the LinkedIn address is edited.
 *
 * Teach Aura shows what Aura read and links here. It does not carry its own
 * copy of this field — two editors for one value is how the address drifted
 * across three columns in the first place.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { canonicalHandle, saveLinkedInAddress } from "@/lib/linkedinAddress";
import { loadLinkedInState, type LinkedInState } from "@/lib/linkedinState";

const BLUE = "#0670C4";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";

export default function LinkedInAddressCard({ userId }: { userId: string | null }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<LinkedInState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadLinkedInState(userId).then((s) => {
      if (!alive) return;
      setState(s);
      setValue(s.address ?? "");
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const save = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const next = await saveLinkedInAddress(userId, value);
      setState((s) => ({
        ...(s ?? { connected: false, confirmedByRead: false, addressConfirmed: false, sourceStatus: null, canPost: false, lastSyncedAt: null }),
        handle: next.handle, address: next.profileUrl,
      }));
      setValue(next.profileUrl ?? "");
      toast.success("LinkedIn address saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that address.");
    } finally {
      setBusy(false);
    }
  };

  const valid = Boolean(canonicalHandle(value));

  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBlockEnd: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#0F1519" }}>Your LinkedIn address</div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 6, marginBlockEnd: 12 }}>
        Aura reads your own posts from this address to learn how you write.
        {state?.handle
          ? ` Currently reading @${state.handle}${state.confirmedByRead ? "" : " — Aura hasn't opened it yet"}.`
          : " No address set yet."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://www.linkedin.com/in/your-handle"
          aria-label="LinkedIn profile address"
          style={{
            flex: "1 1 260px", minWidth: 0, border: `1px solid ${LINE}`, borderRadius: 10,
            padding: "9px 12px", fontSize: 13, color: "#0F1519",
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !valid}
          style={{
            /* Primary — filled when it works, switched off when it doesn't. Never a paler blue. */
            background: busy || !valid ? "#E2E7EE" : BLUE,
            color: busy || !valid ? "#98A2AE" : "#FFFFFF",
            border: "none", borderRadius: 999, minHeight: 44,
            padding: "0 22px", fontSize: 14, fontWeight: 600,
            cursor: busy || !valid ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Saving…" : "Save address"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 10, marginBottom: 0 }}>
        Aura stores what it reads so it can write as you. You can delete it any time in Settings.
      </p>
    </div>
  );
}