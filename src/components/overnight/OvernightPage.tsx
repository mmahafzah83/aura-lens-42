import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { ButtonPrimary, ButtonGhost } from "@/components/systemb";

/**
 * THE OVERNIGHT — V23 pilot slice #3.
 *
 * Colour law is the design here: the machine worked alone, so cyan
 * (var(--machine)) carries the page. Blue (var(--act), via ButtonPrimary)
 * appears exactly once — "Open in Composer", where the human takes over.
 *
 * Everything rendered is backed by real rows:
 *  - ghost draft      → linkedin_posts (tracking_status='draft', source_metadata.ghost_draft)
 *  - run summary      → agent_findings statuses + timestamps for the night
 *  - tonight's plan   → pg_cron schedule constants + notification_prefs + content_language
 *  - last 7 nights    → agent_findings grouped by night
 * Per-run phases and flagged claims are NOT recorded, so no phase timeline and
 * no "needs a human" panel are rendered.
 */

/** Real pg_cron schedules (UTC) for the two overnight jobs. */
const HUNT_UTC = "00:00";
const DRAFT_UTC = "00:20";
/** Relevance gate in night-agent-hunt: findings below this never become entries. */
const RELEVANCE_BAR = "0.70";

const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
};

interface FindingRow {
  id: string;
  status: string;
  title: string | null;
  source: string | null;
  url: string | null;
  implication: string | null;
  created_at: string;
  themes: string[] | null;
  dropped_themes: string[] | null;
}

interface GhostDraft {
  id: string;
  body: string;
  language: "en" | "ar";
  words: number;
  findingId: string | null;
  findingTitle: string | null;
  findingSource: string | null;
  createdAt: string;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}
function isArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s || "");
}
function nightKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

const Card: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <div style={{
    background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
    borderRadius: 16, boxShadow: "var(--v23-card-rest)", padding: 18, ...style,
  }}>{children}</div>
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{
    fontFamily: "var(--ff-ui)", fontSize: 12, fontWeight: 500,
    color: "var(--text-muted)", marginBottom: 10,
  }}>{children}</div>
);

const Dot = () => (
  <span aria-hidden style={{
    width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: "var(--machine)",
  }} />
);

interface OvernightPageProps {
  onOpenDraft: (d: {
    id: string; body: string; language: "en" | "ar";
    type: "linkedin_post"; topic: string | null; _source: "linkedin_posts";
  }) => void;
  onOpenSettings: () => void;
}

export default function OvernightPage({ onOpenDraft, onOpenSettings }: OvernightPageProps) {
  const { user, isReady } = useAuthReady();
  const reduced = usePrefersReducedMotion();

  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [draft, setDraft] = useState<GhostDraft | null>(null);
  const [overnightOn, setOvernightOn] = useState<boolean | null>(null);
  const [contentLanguage, setContentLanguage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const uid = user.id;
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [profRes, findRes, ghostRes] = await Promise.all([
      supabase.from("diagnostic_profiles")
        .select("notification_prefs, content_language").eq("user_id", uid).maybeSingle(),
      (supabase.from("agent_findings" as any) as any)
        .select("id, status, title, source, url, implication, created_at, themes, dropped_themes")
        .eq("user_id", uid).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(200),
      (supabase.from("linkedin_posts" as any) as any)
        .select("id, post_text, created_at, source_metadata")
        .eq("user_id", uid).eq("tracking_status", "draft")
        .eq("source_metadata->>ghost_draft", "true")
        .order("created_at", { ascending: false }).limit(1),
    ]);

    const prefs = ((profRes.data as any)?.notification_prefs ?? {}) as Record<string, unknown>;
    setOvernightOn(prefs.overnight_reading_enabled !== false);
    setContentLanguage(((profRes.data as any)?.content_language as string) || null);
    setFindings(((findRes?.data as any[]) || []) as FindingRow[]);

    const g = (((ghostRes?.data as any[]) || []))[0];
    if (g) {
      const body = g.post_text || "";
      const meta = (g.source_metadata || {}) as Record<string, any>;
      setDraft({
        id: g.id, body,
        language: (meta.language === "ar" || isArabic(body)) ? "ar" : "en",
        words: wordCount(body),
        findingId: meta.ghost_draft_finding_id || null,
        findingTitle: meta.finding_implication || null,
        findingSource: meta.finding_source || null,
        createdAt: g.created_at,
      });
    } else {
      setDraft(null);
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => { if (isReady && user) void load(); }, [isReady, user, load]);

  const notUseful = async () => {
    if (!draft?.findingId) return;
    setDismissed(true);
    await (supabase.from("agent_findings" as any) as any)
      .update({ status: "dismissed" }).eq("id", draft.findingId);
  };

  // ── Nights: real rows grouped by the UTC date they were written. ──
  const nightMap = new Map<string, FindingRow[]>();
  for (const f of findings) {
    const k = nightKey(f.created_at);
    if (!nightMap.has(k)) nightMap.set(k, []);
    nightMap.get(k)!.push(f);
  }
  const nights: Array<{ key: string; label: string; rows: FindingRow[] }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const k = d.toISOString().slice(0, 10);
    nights.push({
      key: k,
      label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2).toUpperCase(),
      rows: nightMap.get(k) || [],
    });
  }
  const producedNights = nights.filter((n) => n.rows.some((r) => r.status === "kept")).length;
  const ranNights = nights.filter((n) => n.rows.length > 0).length;

  const lastNight = [...nightMap.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
  const lastRows = lastNight?.[1] || [];
  const lastStart = lastRows.length ? lastRows[lastRows.length - 1].created_at : null;
  const lastEnd = lastRows.length ? lastRows[0].created_at : null;
  const latest = findings[0] || null;

  const counts = lastRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const enter = (i: number): React.CSSProperties => reduced ? {} : {
    animation: "v23CardIn 320ms ease both", animationDelay: `${i * 50}ms`,
  };

  if (!isReady || !loaded) {
    return <div style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", padding: 24 }}>Reading last night…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--ff-ui)", paddingBottom: 40 }}>
      {/* HEADER */}
      <header style={enter(0)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Dot />
          <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--machine)" }}>
            The Overnight
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              What Aura did while you slept
            </h1>
            {lastStart && lastEnd && (
              <p style={{ ...MONO, margin: "6px 0 0", fontSize: 11.5, color: "var(--text-secondary)" }}>
                Last run between {hhmm(lastStart)} and {hhmm(lastEnd)}
              </p>
            )}
          </div>
          <ButtonGhost onClick={onOpenSettings}>Settings</ButtonGhost>
        </div>
      </header>

      {/* LAST NIGHT'S DRAFT — the one earned night surface. */}
      <section
        data-surface="dark"
        style={{
          background: "var(--v23-night)", border: "1px solid var(--v23-night-line)",
          borderRadius: 16, padding: 18, ...enter(1),
        }}
      >
        <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12, fontWeight: 500, color: "var(--machine)", marginBottom: 10 }}>
          Last night's draft
        </div>
        {draft ? (
          <>
            <p
              dir={draft.language === "ar" ? "rtl" : "ltr"}
              style={{
                margin: 0, fontSize: 16,
                lineHeight: draft.language === "ar" ? 1.9 : 1.55,
                fontFamily: draft.language === "ar" ? "var(--ff-ar)" : "var(--ff-ui)",
                textAlign: draft.language === "ar" ? "right" : "left",
                color: "var(--text-inverse)",
              }}
            >
              {(draft.body.split("\n").find((l) => l.trim()) || draft.body).slice(0, 180)}
            </p>
            <div style={{ ...MONO, fontSize: 11, color: "var(--v23-on-night)", marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>{draft.words} words</span>
              <span aria-hidden>·</span>
              <span>{draft.language === "ar" ? "Arabic" : "English"}</span>
              <span aria-hidden>·</span>
              <span>written {hhmm(draft.createdAt)}</span>
              {draft.findingSource && (<><span aria-hidden>·</span><span>{draft.findingSource}</span></>)}
            </div>
            {draft.findingTitle && (
              <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.6, color: "var(--v23-on-night)" }}>
                {draft.findingTitle}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {/* THE one blue element on this page. */}
              <ButtonPrimary
                data-testid="overnight-open-composer"
                onClick={() => onOpenDraft({
                  id: draft.id, body: draft.body, language: draft.language,
                  type: "linkedin_post", topic: null, _source: "linkedin_posts",
                })}
              >Open in Composer</ButtonPrimary>
              {draft.findingId && (
                <ButtonGhost
                  onClick={notUseful}
                  disabled={dismissed}
                  style={{ color: "var(--text-inverse)", border: "1px solid var(--v23-night-line)" }}
                >{dismissed ? "Noted" : "Not useful"}</ButtonGhost>
              )}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--v23-on-night)" }}>
            No draft yet. The Overnight runs at {HUNT_UTC} UTC tonight.
          </p>
        )}
      </section>

      {/* WHAT IT DID — coarse run summary; per-run phases are not recorded. */}
      <Card style={enter(2)}>
        <SectionLabel>What it did</SectionLabel>
        {lastRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            The last seven nights recorded no run for you.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {counts.kept
                ? `On the night of ${lastNight[0]}, Aura kept ${counts.kept} ${counts.kept === 1 ? "finding" : "findings"}.`
                : `On the night of ${lastNight[0]}, Aura read your territory and kept nothing. Nothing cleared the bar — that is the honest result.`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { k: "kept", label: "Kept — turned into a capture" },
                { k: "below_bar", label: "Below the relevance bar" },
                { k: "duplicate", label: "Already in your library" },
                { k: "error", label: "Failed and was logged" },
                { k: "skipped", label: "Skipped" },
                { k: "pending", label: "Waiting for your call" },
                { k: "dismissed", label: "Dismissed by you" },
              ].filter((r) => counts[r.k]).map((r) => (
                <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Dot />
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{r.label}</span>
                  <span style={{ ...MONO, fontSize: 12, color: "var(--text-secondary)", marginLeft: "auto" }}>{counts[r.k]}</span>
                </div>
              ))}
            </div>
            {lastStart && lastEnd && (
              <p style={{ ...MONO, margin: "12px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                {hhmm(lastStart)} → {hhmm(lastEnd)}
              </p>
            )}
          </>
        )}
      </Card>

      {/* TONIGHT'S PLAN */}
      <Card style={enter(3)}>
        <SectionLabel>Tonight's plan</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Reads your territory", value: `${HUNT_UTC} UTC`, note: "schedule" },
            { label: "Writes the draft", value: `${DRAFT_UTC} UTC`, note: "schedule" },
            overnightOn !== null
              ? { label: "Overnight reading", value: overnightOn ? "On" : "Off", note: "your setting" }
              : null,
            contentLanguage
              ? { label: "Draft language", value: contentLanguage === "ar" ? "Arabic" : "English", note: "your setting" }
              : null,
            { label: "Relevance bar", value: RELEVANCE_BAR, note: "system rule" },
            latest?.themes?.length
              ? { label: "Themes watched", value: latest.themes.slice(0, 4).join(", "), note: "learned" }
              : null,
            latest?.dropped_themes?.length
              ? { label: "Themes dropped", value: latest.dropped_themes.slice(0, 4).join(", "), note: "learned" }
              : null,
          ].filter(Boolean).map((row) => {
            const r = row as { label: string; value: string; note: string };
            return (
              <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{r.label}</span>
                <span style={{ ...MONO, fontSize: 12, color: "var(--text-secondary)", marginLeft: "auto" }}>{r.value}</span>
                <span style={{ ...MONO, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {r.note}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* LAST 7 NIGHTS */}
      <Card style={enter(4)}>
        <SectionLabel>Last 7 nights</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, alignItems: "end", height: 84 }}>
          {nights.map((n) => {
            const produced = n.rows.some((r) => r.status === "kept");
            const ran = n.rows.length > 0;
            return (
              <div key={n.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <div
                  title={produced ? "Produced a draft" : ran ? "Ran, produced nothing" : "No run recorded"}
                  style={{
                    width: "100%",
                    height: produced ? 52 : ran ? 16 : 4,
                    borderRadius: 4,
                    background: produced ? "var(--machine)" : "transparent",
                    border: ran && !produced ? "1px solid var(--machine)" : ran ? 0 : "1px solid var(--rule-divider)",
                  }}
                />
                <span style={{ ...MONO, fontSize: 10, color: "var(--text-muted)" }}>{n.label}</span>
              </div>
            );
          })}
        </div>
        <p style={{ ...MONO, margin: "12px 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
          {producedNights} of 7 nights produced a draft · {ranNights} of 7 recorded a run.
        </p>
      </Card>
    </div>
  );
}
