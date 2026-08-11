/**
 * Settings → "Your LinkedIn". The one place a member types their own address.
 *
 * Every address in the database today was guessed from a display name; only a
 * real profile read confirms one. So this card only writes
 * `source_status = 'verified_by_read'` after `linkedin-fetch-profile` actually
 * returns a profile — never on save alone.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canonicalHandle, profileUrlFor, saveLinkedInAddress } from "@/lib/linkedinAddress";
import { loadLinkedInState, type LinkedInState } from "@/lib/linkedinState";

/* System-B tokens */
const ACTION = "#0670C4";
const INK = "#0F1519";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";
const CARD = "#FFFFFF";
const RED = "#C0392B";

const SHAPE_ERROR =
  "That doesn't look like a LinkedIn address. It should look like linkedin.com/in/yourname.";
const READ_ERROR =
  "Aura couldn't open that page. Check the address is exactly what you see in your browser when you're on your own profile.";

interface ReadResult {
  name: string | null;
  headline: string | null;
  photo: string | null;
  posts: number | null;
}

export default function YourLinkedInCard({ userId }: { userId: string | null }) {
  const [state, setState] = useState<LinkedInState | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadLinkedInState(userId).then((s) => {
      if (!alive) return;
      setState(s);
      if (s.address) setValue(s.address);
    });
    return () => { alive = false; };
  }, [userId]);

  const run = async () => {
    if (!userId) return;
    setError(null);
    const handle = canonicalHandle(value);
    if (!handle) { setError(SHAPE_ERROR); return; }
    const profile_url = profileUrlFor(handle) as string;

    setBusy(true);
    try {
      await saveLinkedInAddress(userId, profile_url);
      const { data, error: invokeError } = await supabase.functions.invoke("linkedin-fetch-profile", {
        body: { profile_url },
      });
      if (invokeError || !data || (data as any).error || !(data as any).handle) {
        setError(READ_ERROR);
        return;
      }
      const p = data as any;
      await markVerifiedByRead(userId);

      let posts: number | null = null;
      try {
        const { data: postData } = await supabase.functions.invoke("linkedin-fetch-posts", {
          body: { profile_url },
        });
        const n = (postData as any)?.kept_own_text;
        if (typeof n === "number") posts = n;
      } catch { /* the profile read is what confirms the address */ }

      setResult({
        name: p.full_name ?? null,
        headline: p.headline ?? null,
        photo: p.photo_url ?? null,
        posts,
      });
      setState((s) => ({ ...(s ?? { connected: false, handle: null, address: null, canPost: false, lastSyncedAt: null }), handle, address: profile_url, confirmedByRead: true }));
      setExpanded(false);
    } catch {
      setError(READ_ERROR);
    } finally {
      setBusy(false);
    }
  };

  if (!userId || state === null) return null;
  const confirmed = state.confirmedByRead;

  const shell: React.CSSProperties = {
    background: CARD,
    border: `1px solid ${LINE}`,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    color: INK,
  };

  /* Confirmed just now — show what Aura can see. */
  if (result) {
    return (
      <div style={shell} data-testid="your-linkedin-card">
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>This is what Aura can see.</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          {result.photo && (
            <img
              src={result.photo}
              alt={result.name ? `${result.name} on LinkedIn` : "Your LinkedIn photo"}
              loading="lazy"
              style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: `1px solid ${LINE}` }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            {result.name && <div style={{ fontSize: 14.5, fontWeight: 600 }}>{result.name}</div>}
            {result.headline && (
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{result.headline}</div>
            )}
          </div>
        </div>
        {typeof result.posts === "number" && (
          <p style={{ fontSize: 13, color: MUTED, marginTop: 12, marginBottom: 0 }}>
            Aura read {result.posts} of your posts.
          </p>
        )}
      </div>
    );
  }

  /* Already confirmed — one quiet line. */
  if (confirmed && !expanded) {
    return (
      <div
        style={{ ...shell, padding: "12px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}
        data-testid="your-linkedin-card"
      >
        <span style={{ color: MUTED }}>Your LinkedIn — connected ·</span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{ background: "none", border: 0, padding: 0, color: ACTION, fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}
        >
          Read it again
        </button>
      </div>
    );
  }

  return (
    <div style={shell} data-testid="your-linkedin-card">
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Your LinkedIn</h2>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginTop: 8, marginBottom: 14 }}>
        Aura reads what's already public on your profile — your headline and your recent posts —
        so that what it writes sounds like you and not like anyone else.
        {!confirmed && (state.address
          ? ` We have ${state.address.replace(/^https?:\/\/(www\.)?/, "")} on file, but Aura hasn't read it yet.`
          : " We don't have an address for you yet.")}
      </p>

      <label htmlFor="linkedin-address" style={{ display: "block", fontSize: 12.5, color: MUTED, marginBottom: 6 }}>
        Your LinkedIn address
      </label>
      <input
        id="linkedin-address"
        value={value}
        onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
        placeholder="linkedin.com/in/yourname"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        style={{
          width: "100%", boxSizing: "border-box", border: `1px solid ${error ? RED : LINE}`,
          borderRadius: 8, padding: "10px 12px", fontSize: 14, color: INK, background: "#FFFFFF",
        }}
      />

      {error && (
        <p role="alert" style={{ fontSize: 12.5, color: RED, lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        style={{
          marginTop: 12, width: "100%", padding: "11px 18px", borderRadius: 8, border: "none",
          background: ACTION, color: "#FFFFFF", fontSize: 14, fontWeight: 600,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Reading your profile…" : "Read my profile"}
      </button>

      <p style={{ fontSize: 12, color: MUTED, marginTop: 10, marginBottom: 0 }}>
        Aura reads your posts, and can publish for you — but only when you approve it. Nothing goes out in your name on its own.
      </p>
      <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 6, marginBottom: 0 }}>
        Aura stores what it reads so it can write as you. You can delete it any time in Settings.
      </p>
    </div>
  );
}