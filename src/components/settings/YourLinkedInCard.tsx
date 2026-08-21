/**
 * Settings → "Your LinkedIn". The one place a member types their own address.
 *
 * An address is only ever established two ways: the member's own LinkedIn
 * sign-in hands it back with their token, or the member types it here and a
 * real profile read confirms it. Nothing derives an address from a name. This
 * card writes `source_status = 'verified_by_read'` only after
 * `linkedin-fetch-profile` actually returns a profile — never on save alone.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canonicalHandle, profileUrlFor, saveLinkedInAddress } from "@/lib/linkedinAddress";
import { causeOf, retryLabel } from "@/lib/failureCause";

import { EMPTY_LINKEDIN_STATE, loadLinkedInState, type LinkedInState } from "@/lib/linkedinState";

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

interface PostsOutcome {
  status: "ok" | "failed";
  count: number;
  skipped_reshares: number;
  skipped_empty: number;
  error?: unknown;
}

interface ReadResult {
  name: string | null;
  headline: string | null;
  photo: string | null;
  posts: PostsOutcome | null;
}

export default function YourLinkedInCard({ userId }: { userId: string | null }) {
  const [state, setState] = useState<LinkedInState | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [postsBusy, setPostsBusy] = useState(false);
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

  /**
   * The posts read, on its own. A failure here is a failure — never a zero.
   * The profile read is what confirms the address, so this can be retried
   * without touching anything already established.
   */
  const readPosts = async (profile_url: string): Promise<PostsOutcome> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url, max_posts: 50 },
      });
      if (invokeError) return { status: "failed", count: 0, skipped_reshares: 0, skipped_empty: 0, error: invokeError };
      const d = data as any;
      if (!d || d.error) {
        return { status: "failed", count: 0, skipped_reshares: 0, skipped_empty: 0, error: d?.error ?? "no response" };
      }
      return {
        status: "ok",
        count: typeof d.kept_own_text === "number" ? d.kept_own_text : 0,
        skipped_reshares: Number(d.skipped_reshares ?? 0) || 0,
        skipped_empty: Number(d.skipped_empty ?? 0) || 0,
      };
    } catch (e) {
      return { status: "failed", count: 0, skipped_reshares: 0, skipped_empty: 0, error: e };
    }
  };

  const retryPosts = async () => {
    const handle = canonicalHandle(value);
    if (!handle) return;
    setPostsBusy(true);
    const posts = await readPosts(profileUrlFor(handle) as string);
    setResult((r) => (r ? { ...r, posts } : r));
    setPostsBusy(false);
  };

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
      const posts = await readPosts(profile_url);

      setResult({
        name: p.full_name ?? null,
        headline: p.headline ?? null,
        photo: p.photo_url ?? null,
        posts,
      });
      setState((s) => ({
        ...(s ?? EMPTY_LINKEDIN_STATE),
        handle, address: profile_url, confirmedByRead: true, addressConfirmed: true, sourceStatus: "verified_by_read",
      }));
      setExpanded(false);
    } catch {
      setError(READ_ERROR);
    } finally {
      setBusy(false);
    }
  };


  if (!userId || state === null) return null;
  const confirmed = state.confirmedByRead;
  // The token confirmed who the member is, but LinkedIn gave no public
  // address for them. That is a different sentence from "we have nothing".
  const idOnly = state.sourceStatus === "confirmed_by_identity" && !state.address;
  const needsReconnect = state.needsReconnect;

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
        {result.posts?.status === "ok" && result.posts.count > 0 && (
          <p style={{ fontSize: 13, color: MUTED, marginTop: 12, marginBottom: 0 }}>
            Aura read {result.posts.count} of your posts.
          </p>
        )}
        {result.posts?.status === "ok" && result.posts.count === 0 && (
          <p style={{ fontSize: 13, color: MUTED, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
            {result.posts.skipped_reshares > 0 || result.posts.skipped_empty > 0
              ? `Your profile opened, but nothing on it was your own writing — ${
                  [
                    result.posts.skipped_reshares ? `${result.posts.skipped_reshares} reshares of other people's posts` : "",
                    result.posts.skipped_empty ? `${result.posts.skipped_empty} posts with no text` : "",
                  ].filter(Boolean).join(" and ")
                }. Post something in your own words and Aura will pick it up.`
              : "Your profile opened, but LinkedIn showed no posts on it yet."}
          </p>
        )}
        {result.posts?.status === "failed" && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
            {/* A failed posts read is a failure, not a zero. Same words the
                rest of the product uses. */}
            <p style={{ fontSize: 13, color: RED, lineHeight: 1.6, margin: 0 }}>
              Your profile was read. {causeOf(result.posts.error, "Reading your posts")}
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <button
                type="button"
                onClick={() => void retryPosts()}
                disabled={postsBusy}
                style={{
                  border: "none", background: ACTION, color: "#FFFFFF", borderRadius: 8,
                  padding: "9px 14px", fontSize: 13.5, fontWeight: 600,
                  cursor: postsBusy ? "default" : "pointer", opacity: postsBusy ? 0.6 : 1,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                {postsBusy && <Loader2 size={13} className="animate-spin" />}
                {retryLabel("Reading your posts")}
              </button>
              <button
                type="button"
                onClick={() => setResult((r) => (r ? { ...r, posts: null } : r))}
                style={{ background: "none", border: 0, padding: 0, color: ACTION, fontSize: 13, cursor: "pointer" }}
              >
                Carry on without my posts
              </button>
            </div>
          </div>
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
        {!confirmed && (idOnly
          ? " LinkedIn confirmed your account but didn't hand back a public address. Type it here and Aura will read it."
          : needsReconnect
            ? " Your LinkedIn sign-in has run out. Connect LinkedIn again and Aura can read it."
            : state.address
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