/**
 * Settings → Connections: the ONE place the LinkedIn address is entered or
 * changed, and the one place a read can be started.
 *
 * There used to be a second "Your LinkedIn" card at the top of /settings
 * holding the same value and able to fire the same read — which is how a member
 * could start two reads and watch one hang on "Reading your profile…" forever.
 * That card is gone; its copy about what Aura reads and stores lives here now.
 *
 * Teach Aura shows this state read-only and links here.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { canonicalHandle, saveLinkedInAddress } from "@/lib/linkedinAddress";
import { supabase } from "@/integrations/supabase/client";
import { causeOf, retryLabel } from "@/lib/failureCause";
import { EMPTY_LINKEDIN_STATE, loadLinkedInState, type LinkedInState } from "@/lib/linkedinState";
import { statusFromLinkedInState, type LinkedInStatusView } from "@/lib/linkedinStatus";

const BLUE = "#0670C4";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";
const INK = "#0F1519";
const RED = "#C0392B";

const TONE: Record<LinkedInStatusView["tone"], { fg: string; bg: string; border: string }> = {
  green: { fg: "#12805C", bg: "#EAF6F0", border: "#BFE3D3" },
  amber: { fg: "#9A6F12", bg: "#FBF3E0", border: "#EBD8A8" },
  neutral: { fg: MUTED, bg: "#F2F5F9", border: LINE },
};

export default function LinkedInAddressCard({ userId }: { userId: string | null }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<LinkedInState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One read at a time. A second press while this is set is a no-op. */
  const inFlight = useRef(false);

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

  /**
   * The posts read on its own. The profile read is what confirms the address,
   * so a failure here is retried FROM here — never by starting over and
   * spending another profile scrape.
   */
  const readPosts = async (profile_url: string) => {
    const posts = await supabase.functions.invoke("linkedin-fetch-posts", {
      body: { profile_url, max_posts: 50 },
    }).catch((e) => ({ data: null, error: e } as any));
    const pd = (posts as any)?.data;
    if ((posts as any)?.error || !pd || pd.error) {
      /* A failed posts read is never reported as "no posts". */
      toast.error(causeOf((posts as any)?.error ?? pd?.error, "Reading your posts"), {
        action: { label: retryLabel("Reading your posts"), onClick: () => void save() },
      });
      return;
    }
    const kept = typeof pd.kept_own_text === "number" ? pd.kept_own_text : 0;
    toast.success(kept > 0
      ? `Aura read your profile and ${kept} of your posts.`
      : "Aura read your profile. LinkedIn showed no posts of your own writing yet.");
  };

  /**
   * Saving an address and then doing nothing with it is the bug: two members
   * sat here with an address on file that Aura had never opened. The save now
   * runs the read itself, and says plainly what came back — including when it
   * fails, rather than sitting on "Reading your profile…".
   */
  const save = async () => {
    if (!userId) return;
    if (inFlight.current) {
      toast.message("Aura is already reading your profile — give it a moment.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await saveLinkedInAddress(userId, value);
      setState((s) => ({
        ...(s ?? EMPTY_LINKEDIN_STATE),
        hasRow: true, handle: next.handle, address: next.profileUrl,
      }));
      setValue(next.profileUrl ?? "");

      const profile_url = next.profileUrl!;
      const { data, error: invokeError } = await supabase.functions.invoke("linkedin-fetch-profile", {
        body: { profile_url },
      });
      if (invokeError || !data || (data as any).error) {
        const why = causeOf(invokeError ?? (data as any)?.error, "Reading your profile");
        setError(`Address saved. ${why}`);
        toast.error(`Address saved. ${why}`);
        return;
      }
      setState((s) => ({
        ...(s ?? EMPTY_LINKEDIN_STATE),
        confirmedByRead: true, addressConfirmed: true, sourceStatus: "verified_by_read",
        lastSyncedAt: new Date().toISOString(),
      }));

      await readPosts(profile_url);
    } catch (e) {
      const why = e instanceof Error ? e.message : "Couldn't save that address.";
      setError(why);
      toast.error(why);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const valid = Boolean(canonicalHandle(value));
  const view = statusFromLinkedInState(state ?? EMPTY_LINKEDIN_STATE);
  const tone = TONE[view.tone];

  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBlockEnd: 24 }} data-testid="linkedin-address-card">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Your LinkedIn address</div>
        <span
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
            color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`,
            borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap",
          }}
        >
          {view.label}
        </span>
      </div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 6, marginBlockEnd: 8 }}>
        {/* Copy moved here from the deleted "Your LinkedIn" card. */}
        Aura reads what's already public on your profile — your headline and your recent posts —
        so that what it writes sounds like you and not like anyone else.
        {state?.handle
          ? ` Reading @${state.handle} now${state.confirmedByRead ? "" : " — Aura hasn't opened it yet"}.`
          : " No address set yet."}
      </p>
      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginBlockStart: 0, marginBlockEnd: 12 }}>
        {view.explanation}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          placeholder="https://www.linkedin.com/in/your-handle"
          aria-label="LinkedIn profile address"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            flex: "1 1 260px", minWidth: 0, border: `1px solid ${error ? RED : LINE}`, borderRadius: 10,
            padding: "9px 12px", fontSize: 13, color: INK,
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
          {busy ? "Saving and reading…" : "Save and read my profile"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ fontSize: 12.5, color: RED, lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>
          {error}
        </p>
      )}
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 10, marginBottom: 0 }}>
        Aura reads your posts, and can publish for you — but only when you approve it. Nothing goes out in your
        name on its own.
      </p>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 6, marginBottom: 0 }}>
        Aura stores what it reads so it can write as you. You can delete it any time in Settings.
      </p>
    </div>
  );
}
