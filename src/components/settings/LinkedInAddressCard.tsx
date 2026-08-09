/**
 * Settings → Connections: the one place the LinkedIn address is edited.
 *
 * Teach Aura shows what Aura read and links here. It does not carry its own
 * copy of this field — two editors for one value is how the address drifted
 * across three columns in the first place.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { canonicalHandle, loadLinkedInAddress, saveLinkedInAddress } from "@/lib/linkedinAddress";

const BLUE = "#0670C4";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";

export default function LinkedInAddressCard({ userId }: { userId: string | null }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadLinkedInAddress(userId).then((a) => {
      if (!alive) return;
      setSaved(a.handle);
      setValue(a.profileUrl ?? "");
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const save = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const next = await saveLinkedInAddress(userId, value);
      setSaved(next.handle);
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
        {saved ? ` Currently reading @${saved}.` : " No address set yet."}
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
            background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10,
            padding: "9px 16px", fontSize: 13, fontWeight: 600,
            cursor: busy || !valid ? "not-allowed" : "pointer", opacity: busy || !valid ? 0.5 : 1,
          }}
        >
          {busy ? "Saving…" : "Save address"}
        </button>
      </div>
    </div>
  );
}