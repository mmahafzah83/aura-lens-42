import { useCallback, useEffect, useMemo, useState } from "react";
import { Moon, PenLine, Radar, Paperclip, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { track } from "@/lib/track";
import { loadStartCards, type StartCard } from "@/components/composer/startCards";
import { TIER_BANDS, bandFromKey, bandFromScore } from "@/hooks/useTierFromImprint";
import { filterPublishedRows, postEffectiveDate } from "@/lib/postProvenance";

/**
 * TODAY — V23 `s-today`.
 *
 * One move a day, ranked over state that already exists. There is no moves
 * table (the retired `recommended_moves` was NOT recreated) and no new AI
 * service: the ranking is a first-match-wins pass over drafts, overnight
 * findings, signal evidence, and capture recency.
 *
 * Deliberately NOT rendered, because the data does not exist:
 *   expiry / countdowns (no expiry column anywhere), the "best hour to post"
 *   window (no audience-hour data), competitor claims, read state, comment
 *   counts, the weekly plan and the monthly page.
 *
 * Colour law: cyan (--machine) = the machine is awake, never on a button.
 * Blue (--act) = your turn; labels on blue are --text-inverse. Amber appears
 * zero times — nothing on this page has a clock running.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };
const HUNT_UTC = "00:00";
const DISMISS_EVENT = "today_move_dismissed";

const Card: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <div style={{
    background: "var(--surface-card)", border: "1px solid var(--rule-outer)", borderRadius: 16,
    boxShadow: "var(--v23-card-rest)", padding: 20, ...style,
  }}>{children}</div>
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
    {children}
  </div>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 10,
    padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: "var(--act)", color: "var(--text-inverse)", ...style,
  }} {...rest} />
);

const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 10,
    padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: "transparent", color: "var(--act)", border: "1px solid var(--act)", ...style,
  }} {...rest} />
);

type MoveKind = "draft_waiting" | "overnight" | "new_evidence" | "accelerating" | "capture_gap";

interface Move {
  kind: MoveKind;
  /** Stable dismissal key — the row this move points at. */
  ref: string;
  /** Rule that selected it, printed in the DOM for auditability. */
  rule: string;
  headline: string;
  /** The plain-English defence, built only from facts. */
  why: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  icon: typeof PenLine;
  /** Cyan when the machine did the work, blue when it is the user's own material. */
  accent: string;
}

interface DraftRow {
  id: string; body: string | null; language: string | null; type: string | null;
  title: string | null; signal_id: string | null; updated_at: string; created_at: string;
}
interface FindingRow { id: string; title: string | null; implication: string | null; source: string | null; created_at: string; url: string | null }

export interface TodayPageProps {
  onOpenDraft: (d: { id: string; body: string; language: "en" | "ar"; type: "carousel" | "framework" | "linkedin_post"; topic?: string | null; _source?: "content_items" | "linkedin_posts" }) => void;
  onOpenSignalDraft: (p: { topic: string; context: string; signalId?: string; signalTitle?: string; sourceType?: string; contentFormat?: "post" }) => void;
  onOpenOvernight: () => void;
  onOpenCapture: () => void;
  onOpenSignals: () => void;
}

const words = (s: string | null | undefined) => (s || "").trim().split(/\s+/).filter(Boolean).length;
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default function TodayPage({
  onOpenDraft, onOpenSignalDraft, onOpenOvernight, onOpenCapture, onOpenSignals,
}: TodayPageProps) {
  const { user, isReady } = useAuthReady();
  const uid = user?.id ?? null;

  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [signalTitles, setSignalTitles] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [startCards, setStartCards] = useState<StartCard[]>([]);
  const [lastCaptureAt, setLastCaptureAt] = useState<string | null>(null);
  const [weekCaptures, setWeekCaptures] = useState(0);
  const [weekPosts, setWeekPosts] = useState(0);
  const [medianWeekCaptures, setMedianWeekCaptures] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [tierKey, setTierKey] = useState<string | null>(null);
  const [liveSignals, setLiveSignals] = useState<number | null>(null);
  const [totalCaptures13w, setTotalCaptures13w] = useState(0);
  const [justDismissed, setJustDismissed] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const since13 = startOfWeek(new Date());
    since13.setDate(since13.getDate() - 12 * 7);
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [dismissRes, draftRes, findRes, entryRes, postRes, scoreRes, themeRes, cards] = await Promise.all([
      (supabase.from("product_events" as any) as any)
        .select("props").eq("user_id", uid).eq("event", DISMISS_EVENT),
      supabase.from("content_items")
        .select("id, body, language, type, title, signal_id, updated_at, created_at")
        .eq("user_id", uid).eq("status", "draft").order("updated_at", { ascending: false }).limit(10),
      (supabase.from("agent_findings" as any) as any)
        .select("id, title, implication, source, created_at, url")
        .eq("user_id", uid).gte("created_at", dayAgo).order("created_at", { ascending: false }).limit(10),
      supabase.from("entries").select("created_at").eq("user_id", uid)
        .gte("created_at", since13.toISOString()).order("created_at", { ascending: false }),
      supabase.from("linkedin_posts").select("created_at, published_at, source_type, tracking_status")
        .eq("user_id", uid)
        .gte("created_at", since13.toISOString()),
      supabase.from("score_snapshots").select("score, tier, created_at")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      supabase.from("strategic_signals").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("status", "active"),
      loadStartCards(uid).catch(() => ({ cards: [] as StartCard[], totalSignals: 0 })),
    ]);

    setDismissed(new Set(((dismissRes.data as any[]) || [])
      .map((r) => String(r?.props?.ref || "")).filter(Boolean)));

    const dRows = ((draftRes.data as any[]) || []) as DraftRow[];
    setDrafts(dRows);

    const sigIds = Array.from(new Set(dRows.map((d) => d.signal_id).filter(Boolean))) as string[];
    if (sigIds.length) {
      const { data: sigs } = await supabase.from("strategic_signals")
        .select("id, signal_title").in("id", sigIds);
      const map: Record<string, string> = {};
      ((sigs as any[]) || []).forEach((s) => { if (s.signal_title) map[s.id] = s.signal_title; });
      setSignalTitles(map);
    }

    setFindings(((findRes.data as any[]) || []) as FindingRow[]);
    setStartCards(cards.cards);

    const entries = ((entryRes.data as any[]) || []);
    setLastCaptureAt(entries[0]?.created_at ?? null);

    const wk = startOfWeek(new Date()).getTime();
    setWeekCaptures(entries.filter((e) => startOfWeek(new Date(e.created_at)).getTime() === wk).length);
    setWeekPosts(filterPublishedRows(((postRes.data as any[]) || []))
      .filter((p) => startOfWeek(new Date(postEffectiveDate(p) || p.created_at)).getTime() === wk).length);

    // Median weekly captures across the 12 completed weeks — the user's own rhythm.
    const buckets = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      const s = new Date(since13); s.setDate(s.getDate() + i * 7);
      buckets.set(s.getTime(), 0);
    }
    entries.forEach((e) => {
      const k = startOfWeek(new Date(e.created_at)).getTime();
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
    });
    const vals = Array.from(buckets.values()).sort((a, b) => a - b);
    setMedianWeekCaptures(vals.length >= 4
      ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2))
      : null);

    const snap = ((scoreRes.data as any[]) || [])[0];
    setScore(snap?.score ?? null);
    setTierKey(snap?.tier ?? null);

    setLiveSignals((themeRes as any).count || null);
    setTotalCaptures13w(entries.length);

    setLoaded(true);
  }, [uid]);

  useEffect(() => { if (isReady) void load(); }, [isReady, load]);

  const band = useMemo(() => bandFromKey(tierKey) ?? bandFromScore(score), [tierKey, score]);
  const nextBand = useMemo(() => {
    if (!band) return null;
    const i = TIER_BANDS.findIndex((b) => b.key === band.key);
    return i >= 0 && i < TIER_BANDS.length - 1 ? TIER_BANDS[i + 1] : null;
  }, [band]);

  /** First match wins. Every branch skips rows the user already said "not today" to. */
  const move: Move | null = useMemo(() => {
    if (!loaded) return null;
    const ok = (ref: string) => !dismissed.has(ref);

    // 1 — a draft is already written.
    const draft = drafts.find((d) => ok(`draft:${d.id}`) && words(d.body) > 0);
    if (draft) {
      const wc = words(draft.body);
      const lang = draft.language === "ar" ? "Arabic" : "English";
      const sigTitle = draft.signal_id ? signalTitles[draft.signal_id] : null;
      const age = daysSince(draft.updated_at || draft.created_at);
      return {
        kind: "draft_waiting", ref: `draft:${draft.id}`,
        rule: "Rule 1 — a draft is waiting (content_items.status = draft)",
        headline: "Publish the draft you already wrote.",
        why: [
          `"${draft.title || sigTitle || "Untitled draft"}" is ${wc} words in ${lang}${sigTitle ? `, written from your signal "${sigTitle}"` : ""}.`,
          age === 0 ? "You wrote it today." : `It has been sitting for ${age} ${age === 1 ? "day" : "days"}.`,
          "The thinking is done and the words exist — nothing else on this list costs you less.",
        ].join(" "),
        primaryLabel: "Read it and publish",
        secondaryLabel: "Change one line first",
        onPrimary: () => onOpenDraft({
          id: draft.id, body: draft.body || "",
          language: draft.language === "ar" ? "ar" : "en",
          type: (draft.type === "carousel" || draft.type === "framework") ? (draft.type as any) : "linkedin_post",
          topic: draft.title, _source: "content_items",
        }),
        onSecondary: () => onOpenDraft({
          id: draft.id, body: draft.body || "",
          language: draft.language === "ar" ? "ar" : "en",
          type: (draft.type === "carousel" || draft.type === "framework") ? (draft.type as any) : "linkedin_post",
          topic: draft.title, _source: "content_items",
        }),
        icon: PenLine, accent: "var(--act)",
      };
    }

    // 2 — The Overnight produced something in the last 24 hours.
    const finding = findings.find((f) => ok(`finding:${f.id}`) && !!f.title);
    if (finding) {
      const hrs = Math.max(1, Math.round((Date.now() - new Date(finding.created_at).getTime()) / 3600_000));
      return {
        kind: "overnight", ref: `finding:${finding.id}`,
        rule: "Rule 2 — The Overnight produced something in the last 24h (agent_findings)",
        headline: "Aura wrote something while you slept.",
        why: [
          `The Overnight surfaced "${finding.title}"${finding.source ? ` from ${finding.source}` : ""} ${hrs} ${hrs === 1 ? "hour" : "hours"} ago.`,
          finding.implication ? `It matters to you because: ${finding.implication}` : "",
          "You did not go looking for it — it arrived, so reading it costs you minutes, not hours.",
        ].filter(Boolean).join(" "),
        primaryLabel: "Read what it found",
        secondaryLabel: "Open The Overnight",
        onPrimary: onOpenOvernight,
        onSecondary: onOpenOvernight,
        icon: Moon, accent: "var(--machine)",
      };
    }

    // 3 — new evidence landed on a signal since you wrote about it.
    const evid = startCards.find((c) => c.kind === "new_evidence" && ok(`signal:${c.signalId}`));
    if (evid) {
      return {
        kind: "new_evidence", ref: `signal:${evid.signalId}`,
        rule: "Rule 3 — new evidence on a signal since your last post about it",
        headline: "Say more about something you already own.",
        why: `${evid.reason} ${evid.insight || ""} You have already published on this once, so your readers have context — the new sources let you add to an argument instead of starting one.`.trim(),
        primaryLabel: "Write the follow-up",
        secondaryLabel: "Look at the evidence first",
        onPrimary: () => onOpenSignalDraft({
          topic: evid.title, context: evid.insight, signalId: evid.signalId,
          signalTitle: evid.title, sourceType: "signal", contentFormat: "post",
        }),
        onSecondary: onOpenSignals,
        icon: PenLine, accent: "var(--act)",
      };
    }

    // 4 — an accelerating signal you have never written about.
    const fresh = startCards.find((c) => (c.kind === "accelerating" || c.kind === "never_written") && ok(`signal:${c.signalId}`));
    if (fresh) {
      return {
        kind: "accelerating", ref: `signal:${fresh.signalId}`,
        rule: fresh.kind === "accelerating"
          ? "Rule 4 — accelerating signal, highest strength, not yet written about"
          : "Rule 4 — strongest signal you have never written about",
        headline: "Write the one you keep collecting evidence for.",
        why: `${fresh.reason} ${fresh.insight || ""} ${fresh.fragmentCount} sources have stacked up behind it and none of that thinking has left your account yet.`.trim(),
        primaryLabel: "Write this one",
        secondaryLabel: "Look at the evidence first",
        onPrimary: () => onOpenSignalDraft({
          topic: fresh.title, context: fresh.insight, signalId: fresh.signalId,
          signalTitle: fresh.title, sourceType: "signal", contentFormat: "post",
        }),
        onSecondary: onOpenSignals,
        icon: Radar, accent: "var(--act)",
      };
    }

    // 5 — the well is running dry.
    if (lastCaptureAt && daysSince(lastCaptureAt) >= 4 && ok("capture_gap")) {
      const d = daysSince(lastCaptureAt);
      return {
        kind: "capture_gap", ref: "capture_gap",
        rule: "Rule 5 — no capture in 4 or more days (entries.created_at)",
        headline: "Capture one thing.",
        why: `Your last capture was ${d} days ago. Aura only finds patterns in what you feed it, and with nothing new in ${d} days there is nothing honest left for it to draft from. One link is enough to restart the loop.`,
        primaryLabel: "Capture something",
        secondaryLabel: "Open your library",
        onPrimary: onOpenCapture,
        onSecondary: onOpenSignals,
        icon: Paperclip, accent: "var(--act)",
      };
    }

    return null;
  }, [loaded, dismissed, drafts, signalTitles, findings, startCards, lastCaptureAt,
      onOpenDraft, onOpenSignalDraft, onOpenOvernight, onOpenCapture, onOpenSignals]);

  const dismiss = useCallback(async () => {
    if (!move) return;
    const ref = move.ref;
    setDismissed((prev) => new Set(prev).add(ref));
    setJustDismissed(true);
    await track(DISMISS_EVENT, { ref, kind: move.kind });
  }, [move]);

  if (!isReady || !loaded) {
    return <div style={{ ...MONO, fontSize: 12, color: "var(--text-muted)", padding: "40px 0" }}>Reading your state…</div>;
  }

  const rhythmQualifies = medianWeekCaptures != null && totalCaptures13w > 0;

  return (
    <div style={{ display: "grid", gap: 26, paddingTop: 4 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>
          Today
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0, maxWidth: 620 }}>
          One move, chosen from what you already have. If nothing is worth your time, this page says so.
        </p>
      </header>

      {/* ── The move ─────────────────────────────────────────── */}
      <section style={{ display: "grid", gap: 12 }}>
        <SectionLabel>{move ? "Your move" : "Your move"}</SectionLabel>

        {move ? (
          <Card style={{ borderLeft: `3px solid ${move.accent}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <move.icon size={15} style={{ color: move.accent }} aria-hidden />
              <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {move.rule}
              </span>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
              {move.headline}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0, maxWidth: 660 }}>
              {move.why}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <PrimaryButton onClick={move.onPrimary}>{move.primaryLabel}</PrimaryButton>
              <GhostButton onClick={move.onSecondary}>{move.secondaryLabel}</GhostButton>
              <GhostButton
                onClick={() => void dismiss()}
                style={{ color: "var(--text-secondary)", borderColor: "var(--rule-outer)" }}
              >
                Not today
              </GhostButton>
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Check size={15} style={{ color: "var(--machine)" }} aria-hidden />
              <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Nothing qualifies
              </span>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
              {justDismissed ? "That's it for today." : "Nothing worth your four minutes today."}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0, maxWidth: 660 }}>
              No draft is waiting, The Overnight found nothing new since yesterday, and no signal has
              moved enough to be worth a post. Aura would rather tell you that than invent a task.
              Close this and get on with your day — it reads again tonight.
            </p>
          </Card>
        )}
      </section>

      {/* ── If you have ten more minutes — only computable items ─ */}
      {rhythmQualifies && (
        <section style={{ display: "grid", gap: 12 }}>
          <SectionLabel>If you have ten more minutes</SectionLabel>
          <Card>
            <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Capture rhythm — <strong style={{ ...MONO, color: "var(--text-primary)" }}>{weekCaptures}</strong>{" "}
              {weekCaptures === 1 ? "capture" : "captures"} and{" "}
              <strong style={{ ...MONO, color: "var(--text-primary)" }}>{weekPosts}</strong>{" "}
              {weekPosts === 1 ? "post" : "posts"} this week, against your own median of{" "}
              <strong style={{ ...MONO, color: "var(--text-primary)" }}>{medianWeekCaptures}</strong>{" "}
              {medianWeekCaptures === 1 ? "capture" : "captures"} a week over the last twelve weeks.
              {weekCaptures < (medianWeekCaptures ?? 0)
                ? " You are below your own pace — one capture closes the gap."
                : " You are at or above your own pace."}
            </div>
            <div style={{ marginTop: 14 }}>
              <GhostButton onClick={onOpenCapture}>Capture one thing</GhostButton>
            </div>
          </Card>
        </section>
      )}

      {/* ── Next milestone — real Imprint only ──────────────────── */}
      {score != null && band && (
        <section style={{ display: "grid", gap: 12 }}>
          <SectionLabel>Next milestone</SectionLabel>
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...MONO, fontSize: 30, fontWeight: 700, color: "var(--text-primary)" }}>{Math.round(score)}</span>
              <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                Imprint — {band.name} ({band.min}–{band.max})
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.6 }}>
              {nextBand
                ? <>You are <strong style={{ ...MONO, color: "var(--text-primary)" }}>{Math.max(0, nextBand.min - Math.round(score))}</strong> points from {nextBand.name}. Aura cannot tell you what a single post is worth, so it will not guess.</>
                : <>You are in the top band. There is nothing above {band.name} to chase.</>}
            </p>
          </Card>
        </section>
      )}

      {/* ── Return contract — only the loop that actually runs ──── */}
      <section style={{ display: "grid", gap: 12 }}>
        <SectionLabel>When Aura comes back</SectionLabel>
        <Card style={{ borderLeft: "3px solid var(--machine)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Moon size={15} style={{ color: "var(--machine)" }} aria-hidden />
            <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
              Tonight <strong style={{ ...MONO, color: "var(--text-primary)" }}>{HUNT_UTC} UTC</strong> — The Overnight reads for you
              {liveSignals ? <> across your <strong style={{ ...MONO, color: "var(--text-primary)" }}>{liveSignals}</strong> live signals</> : null}.
            </span>
          </div>
        </Card>
      </section>
    </div>
  );
}
