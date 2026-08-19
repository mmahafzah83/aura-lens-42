/**
 * CV AGAINST PROFILE — the member-facing reader for
 * `diagnostic_profiles.cv_crosscheck`.
 *
 * Everything the function returns is rendered. Nothing is collapsed except the
 * evidence quotes inside a finding, and nothing is rewritten in the client.
 *
 * The reading budget drives the order: verdict, then the three findings with
 * their loss and their replacement line, then the long tail. A member reads
 * roughly 425 words of the ~1,750 we generate — these are the 425.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OB } from "@/components/onboarding/tokens";

export type AuraCan = "capture_evidence" | "draft_post" | "suggest_headline" | "track_signal";

export type CvFinding = {
  what?: string | null;
  why_it_matters?: string | null;
  do_this?: string | null;
  weight?: string | null;
  what_you_lose?: string | null;
  rewrite?: string | null;
  do_first?: boolean | null;
  aura_can?: AuraCan | null;
  evidence?: { cv_line?: string | null; profile_line?: string | null } | null;
};

export type CvRecommendation = {
  action?: string | null;
  why_now?: string | null;
  aura_can?: AuraCan | null;
};

export type CvCrosscheckData = {
  headline_finding?: string | null;
  findings?: CvFinding[] | null;
  defensibility?: string[] | null;
  cv_is_behind?: string[] | null;
  profile_vs_voice?: string | null;
  reading_the_shape?: string | null;
  headline_suggestion?: string | null;
  the_hard_truth?: string | null;
  recommendations?: CvRecommendation[] | null;
  peer_comparison?: string | null;
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function hasCvCrosscheck(raw: unknown): raw is CvCrosscheckData {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as CvCrosscheckData;
  const findings = Array.isArray(d.findings) ? d.findings.filter((f) => f && (f.what || f.do_this)) : [];
  return Boolean(
    text(d.headline_finding) ||
      findings.length ||
      strings(d.defensibility).length ||
      strings(d.cv_is_behind).length ||
      text(d.profile_vs_voice) ||
      text(d.the_hard_truth) ||
      text(d.headline_suggestion),
  );
}

/* ---------------------------------------------------------------- tokens -- */

const SCROLL_MARGIN = 116; /* the sticky journey chrome is 100px + 8 */

const mono: React.CSSProperties = {
  fontFamily: OB.mono,
  fontSize: 12.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: OB.muted,
  margin: 0,
};

const body: React.CSSProperties = {
  fontFamily: OB.ui,
  fontSize: 16,
  lineHeight: 1.6,
  color: OB.ink,
  margin: 0,
};

const h2: React.CSSProperties = {
  fontFamily: OB.ui,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
  color: OB.ink,
  margin: "0 0 12px",
  letterSpacing: "-0.01em",
};

const h3: React.CSSProperties = {
  fontFamily: OB.ui,
  fontSize: 19,
  fontWeight: 700,
  lineHeight: 1.35,
  color: OB.ink,
  margin: 0,
  letterSpacing: "-0.015em",
};

const card: React.CSSProperties = {
  background: OB.white,
  border: `1px solid ${OB.line}`,
  borderRadius: 14,
  padding: 20,
};

const boxed: React.CSSProperties = {
  border: `1px solid ${OB.line}`,
  borderRadius: 12,
  padding: 14,
  background: "#FAFBFC",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: "12px 0",
  minHeight: 44,
  color: OB.blue,
  fontFamily: OB.ui,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "start",
};

const outlineBtn: React.CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 10,
  border: `1px solid ${OB.blue}`,
  background: "transparent",
  color: OB.blue,
  fontFamily: OB.ui,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const filledBtn: React.CSSProperties = {
  ...outlineBtn,
  background: OB.blue,
  color: OB.white,
  border: 0,
};

/* ----------------------------------------------------------------- parts -- */

/** Visible label, contextual accessible name, `role="status"` confirmation. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard refused — the text is on screen and selectable */
    }
    setDone(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 5000);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={() => void copy()} aria-label={label} style={outlineBtn}>
        Copy
      </button>
      {/* focus never moves; the confirmation is announced, not focused */}
      <span role="status" style={{ ...body, fontSize: 13.5, color: OB.muted }}>
        {done ? "Copied" : ""}
      </span>
    </span>
  );
}

function Section({
  id, title, children, style,
}: { id: string; title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section id={id} style={{ ...card, scrollMarginTop: SCROLL_MARGIN, ...style }}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

function PlainList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      {items.map((s, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span aria-hidden style={{ inlineSize: 5, blockSize: 5, borderRadius: 999, background: OB.cyan, marginBlockStart: 10, flex: "0 0 auto" }} />
          <span style={body}>{s}</span>
        </li>
      ))}
    </ul>
  );
}

/** Stacked, never side-by-side: two columns are unreadable at 375px. */
function EvidencePair({ cv, profile }: { cv: string; profile: string }) {
  const row = (label: string, quote: string) => (
    <div>
      <p style={mono}>{label}</p>
      <p
        style={{
          ...body,
          fontStyle: quote ? "italic" : "normal",
          color: quote ? OB.ink : OB.muted,
          borderInlineStart: `3px solid ${OB.line}`,
          paddingInlineStart: 12,
          marginBlockStart: 6,
        }}
      >
        {quote ? `“${quote}”` : label === "YOUR CV" ? "Not on your CV" : "Not on your profile"}
      </p>
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 14, marginBlockStart: 12 }}>
      {row("YOUR CV", cv)}
      {row("YOUR PROFILE", profile)}
    </div>
  );
}

function EvidenceToggle({ cv, profile }: { cv: string; profile: string }) {
  const [open, setOpen] = useState(false);
  if (!cv && !profile) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={linkBtn}>
        {open ? "Hide the two lines" : "Show the two lines"}
      </button>
      {open ? <EvidencePair cv={cv} profile={profile} /> : null}
    </div>
  );
}

const AURA_CAN_LABEL: Record<AuraCan, string> = {
  capture_evidence: "Keep this for me",
  draft_post: "Draft a post about this",
  suggest_headline: "See the suggested headline",
  track_signal: "Track this as a signal",
};

/* First sentence of the section's own content, cut at a word boundary. */
function preview(source: string, limit = 96): string {
  const s = source.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const stop = s.search(/[.!?](\s|$)/);
  const first = stop > 0 ? s.slice(0, stop + 1) : s;
  if (first.length <= limit) return first;
  const cut = first.slice(0, limit);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : limit)}…`;
}

/**
 * One collapsed section. Native <details> so it survives no-JS, keyboard and
 * find-in-page. `openSignal` lets jumpTo force a row open.
 */
function Disclosure({
  id, label, count, previewText, openSignal, children,
}: {
  id: string;
  label: string;
  count?: number;
  previewText: string;
  openSignal?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openSignal && ref.current) { ref.current.open = true; setOpen(true); }
  }, [openSignal]);

  return (
    <details
      ref={ref}
      id={id}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{ ...card, padding: 0, scrollMarginTop: SCROLL_MARGIN }}
    >
      <summary
        style={{
          listStyle: "none", cursor: "pointer", minBlockSize: 44,
          padding: "14px 18px", display: "flex", gap: 12, alignItems: "center",
        }}
      >
        <span style={{ flex: 1, minInlineSize: 0 }}>
          <span style={{ ...body, fontWeight: 600, display: "block" }}>
            {label}
            {typeof count === "number" && count > 0 ? (
              <span style={{ ...mono, display: "inline", marginInlineStart: 8, fontSize: 12 }}>{count}</span>
            ) : null}
          </span>
          {!open && previewText ? (
            <span style={{ ...body, fontSize: 14, color: OB.muted, display: "block", marginBlockStart: 2 }}>
              {previewText}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          style={{
            flex: "0 0 auto", color: OB.muted, fontSize: 14,
            transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms ease",
          }}
        >
          ›
        </span>
      </summary>
      <div style={{ padding: "0 18px 18px" }}>{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ main -- */

export type CvCrosscheckState = "ready" | "no_cv" | "processing" | "error" | "stale";

export default function CvCrosscheck({
  data,
  userId,
  style,
  state = "ready",
  onRetry,
  onRunAgain,
  uploadSlot,
  onAuraAction,
}: {
  /** Pass the stored object directly when the caller already has it. */
  data?: unknown;
  /** Or let the component read it for this member. */
  userId?: string | null;
  style?: React.CSSProperties;
  state?: CvCrosscheckState;
  onRetry?: () => void;
  onRunAgain?: () => void;
  /** The upload control, rendered when there is no CV on file. */
  uploadSlot?: React.ReactNode;
  onAuraAction?: (
    kind: AuraCan,
    context: { finding?: CvFinding; recommendation?: CvRecommendation },
  ) => void | boolean | Promise<void | boolean>;
}) {
  const [fetched, setFetched] = useState<unknown>(null);
  const [headlineOpen, setHeadlineOpen] = useState(0);
  /* One "Kept ✓" per thing kept — pressing twice cannot write twice. */
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data || !userId) return;
    let alive = true;
    void (async () => {
      const { data: row } = await supabase
        .from("diagnostic_profiles")
        .select("cv_crosscheck")
        .eq("user_id", userId)
        .maybeSingle();
      if (alive) setFetched((row as { cv_crosscheck?: unknown } | null)?.cv_crosscheck ?? null);
    })();
    return () => { alive = false; };
  }, [data, userId]);

  const raw = data ?? fetched;
  const d = hasCvCrosscheck(raw) ? raw : null;

  const findings = useMemo(() => {
    const all = (Array.isArray(d?.findings) ? d!.findings! : []).filter((f) => f && (f.what || f.do_this));
    const firstIdx = all.findIndex((f) => f.do_first === true);
    const marked = all.filter((f) => f.do_first === true);
    if (marked.length > 1) {
      console.warn(`[cv-crosscheck] ${marked.length} findings claim do_first; only the first is marked.`);
    }
    if (firstIdx > 0) {
      const copy = all.slice();
      const [lead] = copy.splice(firstIdx, 1);
      return [lead, ...copy];
    }
    return all;
  }, [d]);

  /* ------------------------------------------------------------- states -- */

  if (state === "no_cv") {
    return (
      <section style={{ ...card, ...style }}>
        <p style={body}>Aura hasn't got a CV to read yet.</p>
        {uploadSlot ? <div style={{ marginBlockStart: 16 }}>{uploadSlot}</div> : null}
      </section>
    );
  }

  if (state === "processing") {
    return (
      <section style={{ ...card, ...style }} aria-live="polite">
        <p style={mono}>Working</p>
        <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
          <li style={body}>Reading your CV</li>
          <li style={{ ...body, color: OB.muted }}>Comparing against your profile</li>
        </ol>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section style={{ ...card, ...style }}>
        <p style={body}>Aura couldn't finish the comparison this time. Nothing you entered is lost — try once more.</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} style={{ ...filledBtn, marginBlockStart: 14 }}>Try again</button>
        ) : null}
      </section>
    );
  }

  if (!d) return null;

  const behind = strings(d.cv_is_behind);
  const proof = strings(d.defensibility);
  const recs = (Array.isArray(d.recommendations) ? d.recommendations : []).filter((r) => r && text(r.action));
  const headlineSuggestion = text(d.headline_suggestion);
  const shape = text(d.reading_the_shape);
  const hardTruth = text(d.the_hard_truth);
  const peer = text(d.peer_comparison);
  const voice = text(d.profile_vs_voice);

  const lead = findings[0] ?? null;
  const rest = findings.slice(1);

  const jumpTo = (id: string) => {
    if (id === "cvx-headline") setHeadlineOpen((n) => n + 1);
    const el = document.getElementById(id);
    if (!el) return;
    window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus({ preventScroll: true });
  };

  const auraControl = (kind: AuraCan | null | undefined, ctx: { finding?: CvFinding; recommendation?: CvRecommendation }) => {
    if (!kind) return null; /* a null offer is no control at all */
    /* Not built yet — a button that does nothing is worse than no button. */
    if (kind === "draft_post" || kind === "track_signal") return null;
    /* No handler wired on this surface — render nothing rather than a dead button. */
    if (kind === "capture_evidence" && !onAuraAction) return null;
    if (kind === "suggest_headline" && !headlineSuggestion) return null;
    const key = `${kind}:${text(ctx.finding?.what) || text(ctx.recommendation?.action)}`;
    if (kept[key]) {
      return (
        <p style={{ ...body, fontSize: 14, fontWeight: 600, color: "#12805C", marginBlockStart: 10 }}>Kept ✓</p>
      );
    }
    return (
      <button
        type="button"
        disabled={saving === key}
        style={{ ...outlineBtn, marginBlockStart: 10 }}
        onClick={async () => {
          if (kind === "suggest_headline") { jumpTo("cvx-headline"); return; }
          if (!onAuraAction) return;
          setSaving(key);
          try {
            const ok = await onAuraAction(kind, ctx);
            if (ok !== false) setKept((k) => ({ ...k, [key]: true }));
          } finally {
            setSaving(null);
          }
        }}
      >
        {saving === key ? "Keeping…" : AURA_CAN_LABEL[kind]}
      </button>
    );
  };

  const Finding = ({ f, first }: { f: CvFinding; first: boolean }) => {
    const rewrite = text(f.rewrite);
    const ev = f.evidence || {};
    const cvLine = text(ev.cv_line) === "Absent" ? "" : text(ev.cv_line);
    const profileLine = text(ev.profile_line) === "Absent" ? "" : text(ev.profile_line);
    return (
      <article style={{ display: "grid", gap: 10 }}>
        {first && f.do_first === true ? <p style={{ ...mono, color: OB.cyanText }}>Do this first</p> : null}
        {text(f.what) ? <h3 style={h3}>{f.what}</h3> : null}
        {text(f.what_you_lose) ? <p style={body}>{f.what_you_lose}</p> : null}
        {rewrite ? (
          <div style={boxed}>
            <p style={mono}>Use this line</p>
            <p style={{ ...body, marginBlockStart: 8 }}>{rewrite}</p>
            <div style={{ marginBlockStart: 12 }}>
              <CopyButton value={rewrite} label="Copy rewrite" />
            </div>
          </div>
        ) : null}
        {text(f.why_it_matters) ? (
          <p style={{ ...body, fontSize: 15, color: OB.muted }}>{f.why_it_matters}</p>
        ) : null}
        {text(f.do_this) ? <p style={{ ...body, fontSize: 15, color: OB.blue }}>{f.do_this}</p> : null}
        <EvidenceToggle cv={cvLine} profile={profileLine} />
        {auraControl(f.aura_can, { finding: f })}
      </article>
    );
  };

  return (
    <div style={{ display: "grid", gap: 16, maxInlineSize: 640, ...style }}>
      {/* 1 · Verdict — the only night surface here. */}
      <section
        style={{
          background: OB.night,
          borderRadius: 20,
          padding: 24,
          scrollMarginTop: SCROLL_MARGIN,
        }}
      >
        <p style={{ ...mono, color: OB.cyan }}>Your CV against your profile</p>
        {text(d.headline_finding) ? (
          <p
            style={{
              fontFamily: OB.ui,
              fontSize: 26,
              lineHeight: 1.25,
              fontWeight: 600,
              color: OB.white,
              margin: "14px 0 0",
              letterSpacing: "-0.02em",
            }}
          >
            {d.headline_finding}
          </p>
        ) : null}
      </section>

      {/* stale */}
      {state === "stale" ? (
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <p style={{ ...body, flex: "1 1 240px" }}>Your CV changed since this ran</p>
          {onRunAgain ? <button type="button" onClick={onRunAgain} style={filledBtn}>Run it again</button> : null}
        </div>
      ) : null}

      {/* 2 · The one thing to fix first — always open, in full */}
      {lead ? (
        <Section id="cvx-findings" title="Where the two disagree">
          <Finding f={lead} first />
        </Section>
      ) : null}

      {/* 3 · Everything else — labelled, one tap away */}
      {rest.length > 0 ? (
        <Disclosure
          id="cvx-findings-rest"
          label="The other disagreements"
          count={rest.length}
          previewText={preview(text(rest[0].what) || text(rest[0].what_you_lose))}
        >
          <div style={{ display: "grid", gap: 26 }}>
            {rest.map((f, i) => <Finding key={i} f={f} first={false} />)}
          </div>
        </Disclosure>
      ) : null}

      {behind.length > 0 ? (
        <Disclosure id="cvx-missing" label="What your CV is missing" count={behind.length} previewText={preview(behind[0])}>
          <PlainList items={behind} />
        </Disclosure>
      ) : null}

      {proof.length > 0 ? (
        <Disclosure id="cvx-defensibility" label="What a CFO will ask" count={proof.length} previewText={preview(proof[0])}>
          <div style={{ display: "grid", gap: 12 }}>
            {proof.map((s, i) => (
              <div key={i} style={boxed}><p style={body}>{s}</p></div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      {headlineSuggestion ? (
        <Disclosure
          id="cvx-headline"
          label="A headline built from this"
          previewText={preview(headlineSuggestion)}
          openSignal={headlineOpen}
        >
          <div style={boxed}>
            <p style={body}>{headlineSuggestion}</p>
            <div style={{ marginBlockStart: 12 }}>
              <CopyButton value={headlineSuggestion} label="Copy suggested headline" />
            </div>
          </div>
        </Disclosure>
      ) : null}

      {shape ? (
        <Disclosure id="cvx-shape" label="The shape of your career" previewText={preview(shape)}>
          <p style={body}>{shape}</p>
        </Disclosure>
      ) : null}

      {voice ? (
        <Disclosure id="cvx-voice" label="What you sound like next to what you claim" previewText={preview(voice)}>
          <p style={body}>{voice}</p>
        </Disclosure>
      ) : null}

      {hardTruth ? (
        <Disclosure id="cvx-truth" label="The hard truth" previewText={preview(hardTruth)}>
          <p style={{ ...body, fontSize: 20, fontWeight: 700, lineHeight: 1.45 }}>{hardTruth}</p>
        </Disclosure>
      ) : null}

      {recs.length > 0 ? (
        <Disclosure id="cvx-now" label="What now" count={recs.length} previewText={preview(text(recs[0].action))}>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 18 }}>
            {recs.map((r, i) => (
              <li key={i}>
                <p style={{ ...body, fontWeight: 600 }}>{r.action}</p>
                {text(r.why_now) ? <p style={{ ...body, fontSize: 15, color: OB.muted }}>{r.why_now}</p> : null}
                {auraControl(r.aura_can, { recommendation: r })}
              </li>
            ))}
          </ol>
        </Disclosure>
      ) : null}

      {peer ? (
        <Disclosure id="cvx-peers" label="How others in your field describe this work" previewText={preview(peer)}>
          <p style={body}>{peer}</p>
        </Disclosure>
      ) : null}
    </div>
  );
}
