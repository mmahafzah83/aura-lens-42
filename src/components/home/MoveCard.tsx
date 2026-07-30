import { useEffect, useMemo, useState } from "react";
import { useOneMove, type OneMoveDraft, type OneMoveSignal } from "@/hooks/useOneMove";

/**
 * MoveCard — one move, at the top of Home.
 *
 * Three states: a waiting draft, the next-best signal, or an honest empty.
 * Every choice carries a plain-English consequence line. Bone surface tokens
 * are set explicitly on the wrapper; logical properties only.
 */

export interface MoveCardProps {
  userId: string | null | undefined;
  onOpenDraft: (d: { id: string; body: string; language: "en" | "ar"; type: "carousel" | "framework" | "linkedin_post"; topic?: string | null }) => void;
  onStartSignalPost: (p: { topic: string; context: string; signalId: string; signalTitle: string }) => void;
}

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

const todayKey = () => new Date().toISOString().slice(0, 10);
const dismissKey = (id: string) => `move_dismissed_${id}_${todayKey()}`;
const isDismissed = (id: string) => { try { return localStorage.getItem(dismissKey(id)) === "1"; } catch { return false; } };
const setDismissed = (id: string) => { try { localStorage.setItem(dismissKey(id), "1"); } catch { /* noop */ } };

/** Purge dismissal keys from previous days — "Not today" never survives the night. */
function purgeStaleDismissals() {
  try {
    const today = todayKey();
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith("move_dismissed_") && !k.endsWith(`_${today}`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

/** Clear today's dismissals for the given ids. */
function clearDismissals(ids: Array<string | null | undefined>) {
  try { ids.forEach((id) => { if (id) localStorage.removeItem(dismissKey(id)); }); } catch { /* noop */ }
}

function relativeTime(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const Kicker: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
    {children}
  </div>
);

const Consequence: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)", margin: 0, maxWidth: 460 }}>{children}</p>
);

const Row: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>{children}</div>
);

const Primary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    border: 0, borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: "var(--act)", color: "var(--text-inverse)", fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

const Outline: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: "transparent", color: "var(--act)", border: "1px solid var(--act)",
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

const TextLink: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ style, ...rest }) => (
  <button type="button" style={{
    background: "none", border: 0, padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 500,
    color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 3,
    fontFamily: "var(--font-body)", ...style,
  }} {...rest} />
);

function Shell({ accent, children }: React.PropsWithChildren<{ accent: string }>) {
  return (
    <section
      aria-label="Your one move"
      style={{
        background: "var(--surface-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--rule-outer)",
        borderInlineStart: `3px solid ${accent}`,
        borderRadius: 0,
        boxShadow: "var(--v23-card-rest)",
        padding: "22px 24px",
        marginBottom: 24,
      }}
    >
      {children}
    </section>
  );
}

const Headline: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: "var(--text-primary)", margin: "0 0 10px" }}>
    {children}
  </h2>
);

const Support: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0, maxWidth: 660 }}>{children}</p>
);

export default function MoveCard({ userId, onOpenDraft, onStartSignalPost }: MoveCardProps) {
  const { loading, draft, signal } = useOneMove(userId);
  const [tick, setTick] = useState(0);

  useEffect(() => { purgeStaleDismissals(); }, []);

  const activeDraft: OneMoveDraft | null = useMemo(
    () => (draft && !isDismissed(draft.id) ? draft : null),
    [draft, tick],
  );
  const activeSignal: OneMoveSignal | null = useMemo(
    () => (signal && !isDismissed(signal.id) ? signal : null),
    [signal, tick],
  );

  // How many of today's real moves the user has passed on.
  const dismissedCount = useMemo(() => {
    let n = 0;
    if (draft && isDismissed(draft.id)) n += 1;
    if (signal && isDismissed(signal.id)) n += 1;
    return n;
  }, [draft, signal, tick]);

  if (loading) return null;

  // STATE A — a draft is waiting.
  if (activeDraft) {
    const d = activeDraft;
    return (
      <Shell accent="var(--act)">
        <Kicker>Your one move · about four minutes</Kicker>
        <Headline>Publish the draft you already wrote.</Headline>
        <Support>
          Aura drafted “{clip(d.firstLine)}” from your reading —{" "}
          <span style={MONO}>{d.wordCount}</span> words, in your voice, waiting since {relativeTime(d.updatedAt)}.
        </Support>
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <Row>
            <Primary onClick={() => onOpenDraft({ id: d.id, body: d.body, language: d.language, type: d.type, topic: d.title })}>
              Review and publish
            </Primary>
            <Consequence>Opens the draft here in Composer. You read it, press Publish, it goes to your LinkedIn.</Consequence>
          </Row>
          <Row>
            <Outline onClick={() => onOpenDraft({ id: d.id, body: d.body, language: d.language, type: d.type, topic: d.title })}>
              Edit it first
            </Outline>
            <Consequence>Same draft, opened for editing. Nothing posts until you say so.</Consequence>
          </Row>
          <Row>
            <TextLink onClick={() => { setDismissed(d.id); setTick((t) => t + 1); }}>Not today</TextLink>
            <Consequence>Shows the next-best move instead. The draft stays safe in Composer.</Consequence>
          </Row>
        </div>
      </Shell>
    );
  }

  // STATE B — the strongest live signal nobody has written on.
  if (activeSignal) {
    const s = activeSignal;
    return (
      <Shell accent="var(--act)">
        <Kicker>Your one move · about four minutes</Kicker>
        <Headline>Write on {s.title}</Headline>
        <Support>
          <span style={MONO}>{s.fragmentCount}</span> {s.fragmentCount === 1 ? "thing you read backs" : "things you read back"} this theme.
        </Support>
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <Row>
            <Primary onClick={() => onStartSignalPost({ topic: s.title, context: s.insight, signalId: s.id, signalTitle: s.title })}>
              Start the post
            </Primary>
            <Consequence>Opens Composer with this theme and your evidence loaded. Nothing posts until you say so.</Consequence>
          </Row>
          <Row>
            <TextLink onClick={() => { setDismissed(s.id); setTick((t) => t + 1); }}>Not today</TextLink>
            <Consequence>Clears this card for today. The theme keeps collecting evidence.</Consequence>
          </Row>
        </div>
      </Shell>
    );
  }

  // STATE B — everything on offer today was passed on.
  if (dismissedCount > 0) {
    return (
      <Shell accent="var(--rule-outer)">
        <Kicker>Your one move</Kicker>
        <Headline>
          You passed on today’s <span style={MONO}>{dismissedCount}</span> move{dismissedCount === 1 ? "" : "s"}.
        </Headline>
        <Support>They return tomorrow morning. Changed your mind?</Support>
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          <div>
            <TextLink onClick={() => { clearDismissals([draft?.id, signal?.id]); setTick((t) => t + 1); }}>
              Bring them back →
            </TextLink>
          </div>
          <Consequence>
            Or{" "}
            <button
              type="button"
              onClick={() => { try { window.dispatchEvent(new CustomEvent("aura:open-capture")); } catch { /* noop */ } }}
              style={{
                background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit",
                color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 3,
              }}
            >
              capture something new
            </button>
            .
          </Consequence>
        </div>
      </Shell>
    );
  }

  // STATE C — honest empty.
  return (
    <Shell accent="var(--rule-outer)">
      <Kicker>Your one move</Kicker>
      <Headline>Nothing worth your four minutes.</Headline>
      <Support>Aura reads your signals again at midnight. Tomorrow this card earns its place again.</Support>
    </Shell>
  );
}
