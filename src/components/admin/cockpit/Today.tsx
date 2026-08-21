import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C, Chip, Label, Modal, MONO, SERIF, Table } from "./ui";

/**
 * TODAY — the front of the founder cockpit.
 *
 * This file renders. It does not compute. Every figure and every sentence
 * below is read out of the stored brief (`daily_brief_snapshots`, the same row
 * the daily email renders) and out of the brief's own audit pairs. Nothing here
 * recounts anything, and nothing here invents a number:
 *
 *   · a figure the system cannot compute renders "?" with its reason IN TEXT,
 *     never as 0;
 *   · where the brief's two counting routes disagree the figure renders "?"
 *     and shows BOTH values, because a disagreement is a bug;
 *   · anything already written down as a known issue may be watched, but is
 *     never put in front of the founder as news.
 */

const NIGHT = "#0F1519";
const AMBER = "#E0A82E";
const OX = "#C0392B";
const BLUE = "#0670C4";

const num = (v: unknown): number | null =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);

/* ------------------------------------------------------------------ */
/* one figure                                                          */
/* ------------------------------------------------------------------ */

export type Figure = {
  key: string;
  label: string;
  /** null means: cannot be computed. `reason` then explains why, in words. */
  value: number | null;
  reason?: string;
  /** Set when the brief's two routes disagreed. Both are shown. */
  disagreement?: { a: number | null; b: number | null };
  /** The rows behind the figure, opened by "show rows" — works on touch. */
  rows?: { head: string[]; body: ReactNode[][] } | null;
  /** Said instead of a table when there is honestly no list to show. */
  rowsNote?: string;
};

function FigureCell({ f, onShow }: { f: Figure; onShow: () => void }) {
  const unknown = f.value === null;
  return (
    <div style={{ flex: "1 1 128px", minWidth: 118 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "#8A96A3",
        }}
      >
        {f.label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontVariantNumeric: "tabular-nums",
          fontSize: 30,
          lineHeight: 1.1,
          color: unknown ? "#8A96A3" : "#FFFFFF",
          marginTop: 6,
        }}
      >
        {unknown ? "?" : f.value}
      </div>
      {unknown && (f.reason || f.disagreement) && (
        <div style={{ fontFamily: SERIF, fontSize: 12, lineHeight: 1.45, color: "#A8B2BD", marginTop: 4 }}>
          {f.disagreement
            ? `two counts disagree: ${f.disagreement.a ?? "?"} and ${f.disagreement.b ?? "?"}`
            : f.reason}
        </div>
      )}
      <button
        type="button"
        onClick={onShow}
        style={{
          marginTop: 8,
          minHeight: 44,
          display: "inline-flex",
          alignItems: "center",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "#CBD4DE",
          background: "transparent",
          border: "1px solid #2A343C",
          borderRadius: 8,
          padding: "0 12px",
          cursor: "pointer",
        }}
      >
        Show rows
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the verdict sentence                                                */
/* ------------------------------------------------------------------ */

/**
 * One sentence, assembled from what the brief actually says. Each clause is a
 * branch on real data, so a quiet day and a bad day do not read alike.
 */
export function verdictSentence(args: {
  publishedWeek: number | null;
  needs: number;
  watch: number;
  draftsWaiting: number | null;
  oldestDraftDays: number | null;
  captureHours: number | null;
}): string {
  const { publishedWeek, needs, watch, draftsWaiting, oldestDraftDays } = args;
  const clauses: string[] = [];

  if (publishedWeek === null) clauses.push("how much was published this week cannot be counted yet");
  else if (publishedWeek === 0) clauses.push("nobody published anything in the last seven days");
  else clauses.push(`${publishedWeek} post${publishedWeek === 1 ? "" : "s"} went out in the last seven days`);

  if (draftsWaiting !== null && draftsWaiting > 0) {
    clauses.push(
      oldestDraftDays !== null
        ? `${draftsWaiting} drafts sit written and unsent, the oldest for ${oldestDraftDays} days`
        : `${draftsWaiting} drafts sit written and unsent`,
    );
  }

  if (needs > 0) clauses.push(`${needs} thing${needs === 1 ? "" : "s"} need you`);
  else if (watch > 0) clauses.push("nothing is blocking anyone, though a few things are worth an eye");
  else clauses.push("nothing is blocking anyone");

  const s = clauses.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

/* ------------------------------------------------------------------ */
/* known issues — known is not news                                    */
/* ------------------------------------------------------------------ */

const STOP = new Set(["the", "a", "an", "of", "on", "to", "is", "and", "in", "for", "no", "not", "with"]);

function words(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** True when this brief item is already written down as a known issue. */
export function matchesKnown(text: string, knownTitles: string[]): boolean {
  const a = words(text);
  if (a.length === 0) return false;
  return knownTitles.some((t) => {
    const b = new Set(words(t));
    if (b.size === 0) return false;
    const hit = a.filter((w) => b.has(w)).length;
    return hit >= Math.max(3, Math.ceil(b.size * 0.6));
  });
}

export function useKnownIssues() {
  const [titles, setTitles] = useState<string[]>([]);
  useEffect(() => {
    let off = false;
    (async () => {
      const { data } = await supabase.from("known_issues").select("title").eq("status", "open").limit(200);
      if (!off) setTitles(((data as any[]) ?? []).map((r) => String(r.title ?? "")));
    })();
    return () => {
      off = true;
    };
  }, []);
  return titles;
}

/* ------------------------------------------------------------------ */
/* the section                                                         */
/* ------------------------------------------------------------------ */

export type NeedsItem = { fingerprint?: string; what: string; impact?: string; action?: string };

export default function TodaySection({
  computedAt,
  verdict,
  figures,
  needs,
  watch,
  handled,
  checkedLine,
  needsAction,
}: {
  computedAt: string;
  verdict: string;
  figures: Figure[];
  needs: NeedsItem[];
  watch: { what: string; impact?: string }[];
  handled: number | null;
  /** What was checked, and when — the calm half of the empty state. */
  checkedLine: string;
  /** The outline action offered against a single needs item. */
  needsAction: (item: NeedsItem) => ReactNode;
}) {
  const [open, setOpen] = useState<Figure | null>(null);
  const shown = needs.slice(0, 5);
  const overTarget = needs.length > 2;

  return (
    <>
      {/* ---------------- 1 · THE VERDICT ---------------- */}
      <section
        style={{
          background: NIGHT,
          borderRadius: 20,
          padding: "22px 20px 20px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#8A96A3",
          }}
        >
          Verdict · computed <span style={{ fontVariantNumeric: "tabular-nums" }}>{computedAt}</span>
        </div>
        <p
          style={{
            margin: "12px 0 0",
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: 1.3,
            color: "#FFFFFF",
            maxWidth: 640,
          }}
        >
          {verdict}
        </p>
        <div style={{ height: 1, background: "#243039", margin: "18px 0 16px" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {figures.slice(0, 5).map((f) => (
            <FigureCell key={f.key} f={f} onShow={() => setOpen(f)} />
          ))}
        </div>
      </section>

      {/* ---------------- 2 · NEEDS YOU ---------------- */}
      <section
        style={{
          background: C.card,
          border: `1px solid ${C.rule}`,
          borderLeft: `3px solid ${OX}`,
          borderRadius: 20,
          padding: "20px 18px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Label>Needs you</Label>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: overTarget ? "#7A5A00" : C.muted,
              background: overTarget ? "#FBF3DD" : C.paper,
              border: `1px solid ${overTarget ? AMBER : C.rule}`,
              borderRadius: 4,
              padding: "5px 9px",
            }}
          >
            {overTarget ? "⚠ " : ""}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{needs.length}</span> this week · target ≤2
          </span>
        </div>

        {needs.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, color: C.ink }}>Nothing needs you.</div>
            <div style={{ fontFamily: SERIF, fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
              {checkedLine}
            </div>
          </div>
        ) : (
          shown.map((item, i) => (
            <div
              key={item.fingerprint ?? i}
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "flex-start",
                justifyContent: "space-between",
                borderTop: i === 0 ? "none" : `1px solid ${C.rule}`,
                paddingTop: i === 0 ? 14 : 16,
                marginTop: i === 0 ? 0 : 0,
              }}
            >
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, lineHeight: 1.35, color: C.ink }}>
                  {item.what}
                </div>
                <p style={{ margin: "6px 0 0", fontFamily: SERIF, fontSize: 14, lineHeight: 1.55, color: C.muted }}>
                  {item.impact ? `${item.impact} ` : ""}
                  {item.action}
                </p>
              </div>
              <div style={{ flex: "0 0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>{needsAction(item)}</div>
            </div>
          ))
        )}
        {needs.length > 5 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 14 }}>
            {needs.length - 5} more are held back — five is all one morning can carry.
          </div>
        )}
      </section>

      {/* ---------------- 3 · KEEP AN EYE, AND HANDLED ---------------- */}
      <section
        style={{
          background: C.card,
          border: `1px solid ${C.rule}`,
          borderRadius: 20,
          padding: "18px",
          marginBottom: 18,
        }}
      >
        <Label>Keep an eye</Label>
        {watch.length === 0 ? (
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.muted, marginTop: 10 }}>
            Nothing on the watch list.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {watch.slice(0, 6).map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: i === 0 ? 0 : 12 }}>
                <span
                  aria-hidden
                  style={{ width: 8, height: 8, borderRadius: 8, background: C.teal, flex: "0 0 auto", marginTop: 7 }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, color: C.ink, lineHeight: 1.35 }}>
                    {w.what}
                  </div>
                  {w.impact && (
                    <div style={{ fontFamily: SERIF, fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>
                      {w.impact}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 1, background: C.rule, margin: "16px 0 12px" }} />
        <div style={{ fontFamily: SERIF, fontSize: 14, color: C.muted }}>
          {handled === null ? (
            <>
              How much was handled automatically is{" "}
              <span style={{ fontFamily: MONO }}>?</span> — the brief records no count today.
            </>
          ) : (
            <>
              <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.ink }}>{handled}</span>{" "}
              thing{handled === 1 ? " was" : "s were"} handled automatically, without you.
            </>
          )}
        </div>
      </section>

      {open && (
        <Modal title={`${open.label} — the rows behind it`} onClose={() => setOpen(null)}>
          {open.disagreement && (
            <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, marginBottom: 14 }}>
              The two counting routes disagreed: <strong>{open.disagreement.a ?? "?"}</strong> and{" "}
              <strong>{open.disagreement.b ?? "?"}</strong>. Until they agree this figure is not reportable.
            </div>
          )}
          {open.value === null && open.reason && !open.disagreement && (
            <div style={{ fontFamily: SERIF, fontSize: 15, color: C.ink, marginBottom: 14 }}>{open.reason}</div>
          )}
          {open.rows && open.rows.body.length > 0 ? (
            <Table head={open.rows.head} rows={open.rows.body} />
          ) : (
            <div style={{ fontFamily: SERIF, fontSize: 15, color: C.muted }}>
              {open.rowsNote ?? "There are no rows behind this figure today."}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** Sum of one grid column across the last seven days, or null if unreadable. */
export function weekSum(grid: any[], key: string): number | null {
  if (!Array.isArray(grid) || grid.length === 0) return null;
  const last = grid.slice(-7);
  let total = 0;
  for (const d of last) {
    const v = num(d?.[key]);
    if (v === null) return null;
    total += v;
  }
  return total;
}

/** The kinds line — who is counted and who is not. Never a tooltip. */
export function kindsLine(customers: number | null, testUsers: number | null): string {
  const c = customers === null ? "?" : String(customers);
  const t = testUsers === null ? "?" : String(testUsers);
  return `${c} customers · 1 staff and ${t} test accounts excluded`;
}

export { BLUE as TODAY_BLUE };

/** Small helper so callers can memoise a figure list cheaply. */
export function useFigures(build: () => Figure[], deps: unknown[]): Figure[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(build, deps);
}
