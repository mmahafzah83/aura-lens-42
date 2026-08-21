/**
 * How you appear — the first thing on My Story.
 *
 * The mirror (what a stranger sees), presence health (six measured rows), and
 * the gap between what the member writes about and what their profile says.
 * Every figure here traces to a stored value; anything missing renders as an
 * em dash rather than a zero.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { scorePresence, earliestExperienceYear, type PresenceRow, type PresenceKey } from "@/lib/presenceHealth";
import { loadLinkedInAddress } from "@/lib/linkedinAddress";
import DraftProfileCopy, { type DraftTarget } from "@/components/identity/DraftProfileCopy";
import { WorkingPanel, type WorkingStage } from "@/components/ui/WorkingPanel";
import { causeOf } from "@/lib/failureCause";

/* ── System-B "Signal" values. Module scope, always. ─────────────────────── */
const INK = "#0F1519";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";
const CARD = "#FFFFFF";
const ACT = "#0670C4";
const SUCCESS = "#12805C";
const AMBER = "#E0A82E";
const NIGHT = "#0F1519";
const NIGHT_TEXT = "#FFFFFF";
const NIGHT_MUTED = "#8A97A6";
const NIGHT_DIM = "#6F7C89";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const SANS = "Inter, system-ui, sans-serif";

const cardStyle: React.CSSProperties = {
  background: CARD, border: `1px solid ${LINE}`, borderRadius: 20, padding: 20,
};
const nightCardStyle: React.CSSProperties = {
  background: NIGHT, borderRadius: 20, padding: 24, color: NIGHT_TEXT,
};
const figureValueStyle: React.CSSProperties = {
  fontFamily: MONO, fontSize: 22, fontWeight: 600, color: NIGHT_TEXT, lineHeight: 1.1,
};
const figureLabelStyle: React.CSSProperties = {
  fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: NIGHT_MUTED, marginBlockStart: 4,
};
const quietLinkStyle: React.CSSProperties = {
  background: "transparent", border: "none", padding: 0, marginBlockStart: 6,
  color: ACT, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textAlign: "start",
  fontFamily: SANS, textDecoration: "none", display: "inline-block", minHeight: 24,
};
const primaryButtonStyle: React.CSSProperties = {
  background: ACT, color: CARD, border: "none", borderRadius: 8, padding: "12px 18px",
  fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 44,
};
const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, background: CARD,
  borderRadius: 4, padding: "5px 9px", fontSize: 12.5, lineHeight: 1.2,
};
const dashStyle: React.CSSProperties = { fontFamily: MONO };

const EM_DASH = "—";

/** The handle out of any linkedin.com/in/<handle> address. */
function handleOf(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return m?.[1] ? m[1].replace(/\/+$/, "") : null;
}

const halvesStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 28,
};
const halfStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 16,
};
const ruleStyle: React.CSSProperties = {
  height: 1, background: LINE, width: "100%", marginBlockEnd: 16,
};
const readLineStyle: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
  fontSize: 12, color: MUTED,
};
const halfNoteStyle: React.CSSProperties = {
  fontSize: 12.5, color: MUTED, margin: "-8px 0 0", lineHeight: 1.6,
};
const comingNextStyle: React.CSSProperties = {
  marginBlockStart: 6, color: ACT, fontSize: 12.5, fontWeight: 600, fontFamily: SANS,
};

/** "10 Aug 2026" — day in mono at the call site. */
function formatReadDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface Snapshot {
  full_name: string | null;
  headline: string | null;
  about: string | null;
  photo_url: string | null;
  location: string | null;
  followers: number | null;
  connections: number | null;
  experience: unknown;
  education: unknown;
  skills: unknown;
  fetched_at: string | null;
}

const barColour = (score: number) => (score >= 8 ? SUCCESS : score === 7 ? ACT : AMBER);

const overallWord = (sum: number) => (sum >= 50 ? "Strong" : sum >= 30 ? "Uneven" : "Thin");

/** Whole-word-ish presence of a theme inside the profile text. */
function mentions(haystack: string, theme: string): boolean {
  const t = theme.trim().toLowerCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}`, "i").test(haystack);
}

export default function HowYouAppear({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [postsWithText, setPostsWithText] = useState<number | null>(null);
  const [themes, setThemes] = useState<{ theme: string; count: number }[]>([]);
  const [totalThemes, setTotalThemes] = useState(0);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<"profile" | "posts" | null>(null);
  const [readDone, setReadDone] = useState<string[]>([]);
  const [readRunId, setReadRunId] = useState(0);
  const [readFailure, setReadFailure] = useState<{ stageKey: string; error?: unknown } | null>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const [snapRes, postsRes, signalsRes, profRes] = await Promise.all([
      supabase.from("linkedin_profile_snapshots")
        .select("full_name,headline,about,photo_url,location,followers,connections,experience,education,skills,fetched_at")
        .eq("user_id", userId).maybeSingle(),
      supabase.from("linkedin_posts").select("id", { count: "exact", head: true })
        .eq("user_id", userId).not("post_text", "is", null).neq("post_text", ""),
      supabase.from("strategic_signals").select("theme_tags").eq("user_id", userId).limit(500),
      supabase.from("diagnostic_profiles").select("avatar_url").eq("user_id", userId).maybeSingle(),
    ]);

    setSnapshot((snapRes.data as Snapshot | null) ?? null);
    setPostsWithText(typeof postsRes.count === "number" ? postsRes.count : null);
    setAvatarUrl(((profRes.data as { avatar_url: string | null } | null)?.avatar_url) ?? null);

    const counts = new Map<string, number>();
    for (const row of (signalsRes.data as { theme_tags: string[] | null }[] | null) || []) {
      for (const raw of row.theme_tags || []) {
        const t = String(raw || "").trim().toLowerCase();
        if (t.length < 3) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    setTotalThemes(ranked.length);
    setThemes(ranked.slice(0, 8).map(([theme, count]) => ({ theme, count })));

    try {
      const address = await loadLinkedInAddress(userId);
      setProfileUrl(address.profileUrl);
    } catch { /* address is optional here */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const rows: PresenceRow[] = useMemo(() => scorePresence(snapshot), [snapshot]);
  const sum = rows.reduce((a, r) => a + r.score, 0);

  const yearsVisible = useMemo(() => {
    const earliest = earliestExperienceYear(snapshot?.experience);
    if (!earliest) return null;
    const years = new Date().getFullYear() - earliest;
    return years > 0 ? years : null;
  }, [snapshot]);

  const profileText = `${snapshot?.headline || ""} ${snapshot?.about || ""}`.toLowerCase();
  const themeRows = themes.map((t) => ({ ...t, carried: mentions(profileText, t.theme) }));
  const carriedOfShown = themeRows.filter((t) => t.carried).length;
  const shown = themeRows.length;
  const firstMissing = themeRows.find((t) => !t.carried);
  const topIsMissing = themeRows.length > 0 && !themeRows[0].carried;

  /** Profile first, then posts. Each call can take two minutes. */
  const readProfile = useCallback(async (from: "profile" | "posts" = "profile") => {
    setReadRunId((n) => n + 1);
    /* A record of what ACTUALLY completed. A finished step stays finished,
       including in the failure state. */
    setReadDone(from === "posts" ? ["profile"] : []);
    if (!profileUrl) { navigate("/settings?tab=connections"); return; }
    /* A hung function must have an exit. Five minutes is the ceiling. */
    readAbortRef.current?.abort();
    const ctrl = new AbortController();
    readAbortRef.current = ctrl;
    const ceiling = window.setTimeout(() => ctrl.abort(), 5 * 60 * 1000);
    setReadFailure(null);
    /* Which stage was open when it broke — read locally, never from stale state. */
    let openStage: "profile" | "posts" = from;
    try {
      if (from === "profile") {
        openStage = "profile";
        setStage("profile");
        const { data, error } = await supabase.functions.invoke("linkedin-fetch-profile", {
          body: { profile_url: profileUrl }, signal: ctrl.signal,
        });
        if (error) throw error;
        if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error?: string }).error));
        setReadDone((d) => (d.includes("profile") ? d : [...d, "profile"]));
      }
      openStage = "posts";
      setStage("posts");
      const { error: postsError } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url: profileUrl, max_posts: 50 }, signal: ctrl.signal,
      });
      if (postsError) throw postsError;
      setReadDone((d) => (d.includes("posts") ? d : [...d, "posts"]));
      await load();
    } catch (e) {
      /* The raw error stays with us — console here, ef_error_log server-side.
         The member reads the cause in their own words, via causeOf. */
      // eslint-disable-next-line no-console
      console.error("[how-you-appear] read failed", { stage: openStage, error: e });
      const raw = ctrl.signal.aborted ? new DOMException("Aborted", "AbortError") : e;
      setReadFailure({ stageKey: openStage, error: raw });
      toast.error(causeOf(raw, openStage === "posts" ? "Reading your posts" : "Reading your profile"));
    } finally {
      window.clearTimeout(ceiling);
      readAbortRef.current = null;
      setStage(null);
    }
  }, [profileUrl, navigate, load]);



  useEffect(() => () => readAbortRef.current?.abort(), []);

  /* Derived from the record of completed steps — never from a single "current
     stage" variable, which would revert a finished step to waiting the moment
     a later step failed. These two calls are not one measured operation, so no
     operation name is passed and no percentage is claimed. */
  const readStages: WorkingStage[] = ([
    { key: "profile", label: "Reading your profile" },
    { key: "posts", label: "Reading your posts" },
  ] as const).map((s) => ({
    key: s.key,
    label: s.label,
    state: readDone.includes(s.key)
      ? "done"
      : readFailure?.stageKey === s.key
        ? "failed"
        : stage === s.key
          ? "active"
          : "waiting",
  }));

  const readPanel = (
    <WorkingPanel
      runId={readRunId}
      title="Reading what LinkedIn shows"
      stages={readStages}
      failure={stage === null ? readFailure : null}
      onRetryFromStage={(key) => void readProfile(key === "posts" ? "posts" : "profile")}
      /* A way onward that is not the retry: the profile read already landed,
         so the member is not blocked by a failed posts read. */
      onCarryOn={
        stage === null && readFailure
          ? {
              label: readDone.includes("profile") ? "Continue without your posts" : "Continue without this read",
              action: () => { setReadFailure(null); void load(); },
            }
          : null
      }
    />
  );


  const useLinkedInPhoto = useCallback(async () => {
    if (!userId || !snapshot?.photo_url || avatarUrl) return;
    const { error } = await supabase.from("diagnostic_profiles").update({ avatar_url: snapshot.photo_url }).eq("user_id", userId);
    if (error) toast.error("Couldn't save that photo just now.");
    else { setAvatarUrl(snapshot.photo_url); toast.success("Your LinkedIn photo is now your Aura photo."); }
  }, [userId, snapshot, avatarUrl]);

  if (loading || !userId) return null;

  /* ── Empty: no snapshot at all ─────────────────────────────────────────── */
  if (!snapshot) {
    return (
      <section style={cardStyle} data-testid="how-you-appear-empty">
        <h2 style={{ fontFamily: SANS, fontSize: 19, fontWeight: 700, color: INK, margin: 0 }}>
          Aura hasn't read your profile yet.
        </h2>
        <p style={{ fontSize: 13.5, color: MUTED, margin: "8px 0 16px", lineHeight: 1.6 }}>
          One address, once. Then this fills in.
        </p>
        {stage !== null || readFailure ? readPanel : (
          <button type="button" style={primaryButtonStyle} onClick={() => void readProfile()}>
            Read my profile
          </button>
        )}
      </section>
    );
  }

  const readDate = formatReadDate(snapshot.fetched_at);

  return (
    <div style={halvesStyle} data-testid="how-you-appear">
      {/* ══ HALF A — what LinkedIn shows ═══════════════════════════════════ */}
      <div style={halfStyle}>
        <div>
          <div style={ruleStyle} />
          <SectionHeader label="WHAT LINKEDIN SHOWS" />
        </div>
      <section style={nightCardStyle}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {snapshot.photo_url ? (
            <img
              src={snapshot.photo_url}
              alt={snapshot.full_name ? `${snapshot.full_name}'s profile photo` : "Profile photo"}
              style={{ width: 72, height: 72, borderRadius: 999, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,255,255,.14)" }}
            />
          ) : (
            <div
              aria-hidden
              style={{ width: 72, height: 72, borderRadius: 999, flexShrink: 0, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)" }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 19, color: NIGHT_TEXT, lineHeight: 1.25 }} dir="auto">
              {snapshot.full_name || EM_DASH}
            </div>
            <div
              dir="auto"
              style={{
                fontSize: 14, color: NIGHT_MUTED, marginBlockStart: 4, lineHeight: 1.45,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {snapshot.headline || EM_DASH}
            </div>
            <div style={{ fontSize: 12.5, color: NIGHT_DIM, marginBlockStart: 4 }} dir="auto">
              {snapshot.location || EM_DASH}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBlockStart: 20 }}>
          {[
            { value: snapshot.followers, label: "People following you" },
            { value: postsWithText, label: "Posts Aura has read" },
            { value: yearsVisible, label: "Years on record" },
          ].map((f) => (
            <div key={f.label} style={{ minWidth: 104 }}>
              <div style={figureValueStyle}>
                {typeof f.value === "number" ? f.value.toLocaleString() : EM_DASH}
              </div>
              <div style={figureLabelStyle}>{f.label}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, color: NIGHT_DIM, marginBlockStart: 18 }}>
          This is what someone sees before they meet you.
        </div>
      </section>

        <div style={readLineStyle}>
          <span>
            Read from LinkedIn on{" "}
            <span style={dashStyle}>{readDate ?? EM_DASH}</span>
          </span>
          {stage === null && !readFailure ? (
            <button type="button" style={{ ...quietLinkStyle, marginBlockStart: 0 }} onClick={() => void readProfile()}>
              Read again
            </button>
          ) : null}
        </div>
        {/* The returning member's path gets the same panel as the first read. */}
        {stage !== null || readFailure ? <div style={{ marginBlockStart: 12 }}>{readPanel}</div> : null}
      </div>

      {/* ══ HALF B — what Aura sees ════════════════════════════════════════ */}
      <div style={halfStyle}>
        <div>
          <div style={ruleStyle} />
          <SectionHeader label="WHAT AURA SEES" />
        </div>
        <p style={halfNoteStyle}>LinkedIn shows the facts. This is what they add up to.</p>

      {/* ── SECTION 2 — presence health ──────────────────────────────────── */}
      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <SectionHeader label="PRESENCE HEALTH" />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
            <span style={{ ...dashStyle, fontSize: 15, fontWeight: 600, color: INK }}>{sum}/60</span>
            <span style={{ fontSize: 12.5, color: MUTED }}>{overallWord(sum)}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ paddingBlock: 10, minHeight: 44 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{r.label}</span>
                <span style={{ ...dashStyle, fontSize: 13, color: MUTED, textAlign: "end" }}>{r.fact}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: LINE, marginBlockStart: 8, overflow: "hidden" }}>
                <div style={{ width: `${r.score * 10}%`, height: "100%", borderRadius: 999, background: barColour(r.score) }} />
              </div>
              {r.weak && (
                <div style={{ marginBlockStart: 8 }}>
                  <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>{r.rule}</div>
                  <FixAction
                    rowKey={r.key}
                    profileUrl={profileUrl}
                    canUsePhoto={!!snapshot.photo_url && !avatarUrl}
                    onUsePhoto={useLinkedInPhoto}
                    onDraft={setDraftTarget}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 3 — the gap ──────────────────────────────────────────── */}
      {themeRows.length >= 3 && (
        <section id="how-you-appear-gap" style={cardStyle}>
          <SectionHeader label="WHAT YOU WRITE ABOUT VS WHAT YOUR PROFILE SAYS" />
          <p style={{ fontSize: 13.5, color: INK, margin: "0 0 12px", lineHeight: 1.6 }}>
            You write about <span style={dashStyle}>{totalThemes}</span> recurring subjects. Your profile mentions{" "}
            <span style={dashStyle}>{carriedOfShown}</span> of the <span style={dashStyle}>{shown}</span> biggest.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {themeRows.map((t) => (
              <span
                key={t.theme}
                style={{
                  ...chipBase,
                  border: t.carried ? `1px solid ${LINE}` : `1px dashed ${LINE}`,
                  color: t.carried ? INK : MUTED,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: t.carried ? SUCCESS : AMBER, flexShrink: 0 }} />
                {t.theme}
              </span>
            ))}
          </div>
          {totalThemes > shown && (
            <div style={{ fontSize: 11.5, color: MUTED, marginBlockStart: 10 }}>
              Showing your <span style={dashStyle}>{shown}</span> most frequent.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTED, marginBlockStart: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: SUCCESS, flexShrink: 0 }} />
            on your profile
            <span aria-hidden="true">·</span>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: AMBER, flexShrink: 0 }} />
            only in your writing
          </div>
          {topIsMissing ? (
            <p style={{ fontSize: 13.5, color: INK, margin: "12px 0 0", lineHeight: 1.6 }}>
              The thing you write about most — {themeRows[0].theme} — appears nowhere on your profile.
            </p>
          ) : firstMissing ? (
            <p style={{ fontSize: 13.5, color: INK, margin: "12px 0 0", lineHeight: 1.6 }}>
              You write about {firstMissing.theme} often. Your profile never mentions it.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: MUTED, margin: "12px 0 0", lineHeight: 1.6 }}>
              Everything you write about is on your profile.
            </p>
          )}
          {firstMissing && (
            <button type="button" style={quietLinkStyle} onClick={() => setDraftTarget("headline")}>
              Put this in my headline →
            </button>
          )}
        </section>
      )}
      </div>

      {draftTarget && (
        <DraftProfileCopy
          target={draftTarget}
          open
          onClose={() => setDraftTarget(null)}
          handle={handleOf(profileUrl)}
          onReadAgain={readProfile}
        />
      )}
    </div>
  );
}

/** The single quiet action under a weak row. Never a button styled as one. */
function FixAction({
  rowKey, profileUrl, canUsePhoto, onUsePhoto, onDraft,
}: {
  rowKey: PresenceKey;
  profileUrl: string | null;
  canUsePhoto: boolean;
  onUsePhoto: () => void;
  onDraft: (target: DraftTarget) => void;
}) {
  if (rowKey === "photo") {
    if (!canUsePhoto) return null;
    return <button type="button" style={quietLinkStyle} onClick={onUsePhoto}>Use my LinkedIn photo</button>;
  }
  if (rowKey === "headline") {
    return <button type="button" style={quietLinkStyle} onClick={() => onDraft("headline")}>Draft a sharper one from my posts →</button>;
  }
  if (rowKey === "about") {
    return <button type="button" style={quietLinkStyle} onClick={() => onDraft("about")}>Draft this from what I've already written →</button>;
  }
  if (rowKey === "experience") {
    return <div style={comingNextStyle}>Aura can draft these from your posts — coming next.</div>;
  }
  if (rowKey === "skills") {
    return (
      <a href="#how-you-appear-gap" style={quietLinkStyle}>See the skills my posts prove →</a>
    );
  }
  if (!profileUrl) return null;
  return <a href={profileUrl} target="_blank" rel="noreferrer" style={quietLinkStyle}>Add it on LinkedIn →</a>;
}
