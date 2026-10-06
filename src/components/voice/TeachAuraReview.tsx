/**
 * What Aura read — the honesty surface, stated as an answer rather than a queue.
 *
 * `voice_window()` and `voice-compute-traits` both respect
 * `voice_corpus_status = 'excluded'`, so setting something aside really does
 * change the measured traits. Changes are queued and applied together: one
 * recompute per Apply, not one per click.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { HOOK_LABEL } from "@/lib/voiceOverview";
import { nPosts } from "@/constants/vocabulary";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayDate, arStyle } from "@/lib/arDisplay";
import { corpusWord, hookWord, isoNum } from "@/lib/voiceText";
import { PAGE_SIZE, setCorpusStates, type CorpusPost, type CorpusState } from "@/lib/teachAura";
import {
  GREEN, INK, LINE, MUTED, SURFACE, TYPE, cardStyle, chipStyle, ghostButton, microLabel, monoNum, primaryButton,
} from "@/components/voice/tokens";

const STATE_CHIP: Record<CorpusState, { bg: string; fg: string; border: string; label: string }> = {
  included: { bg: "#EAF6F0", fg: GREEN, border: "#BFE3D3", label: "Counted" },
  excluded: { bg: SURFACE, fg: MUTED, border: "#DDE4EC", label: "Set aside" },
  auto_excluded: { bg: "#FBF4E4", fg: "#9A6F12", border: "#F0DFB4", label: "Set aside by KnownBy" },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

type Filter = "all" | "aside" | "arabic" | "old";

const setAsideLabel = (reason: string | null) => reason ? `Set aside · ${reason}` : "Set aside";

export default function TeachAuraReview({
  posts, includedCount, excludedCount, ambiguous, onApplied,
}: {
  posts: CorpusPost[];
  includedCount: number;
  excludedCount: number;
  ambiguous: CorpusPost[];
  /** Applies the queued changes, then recomputes once and reports what moved. */
  onApplied: (changes: { include: string[]; exclude: string[] }) => Promise<void>;
}) {
  const { lang, t } = useLanguage();
  const ar = lang === "ar";
  const tr = { lang, t };
  const L = (en: string, key: string, vars?: Record<string, unknown>) => (ar ? t(key, vars) : en);
  const dateOf = (iso: string | null) => (ar ? (iso ? displayDate(iso, lang) : "—") : fmtDate(iso));
  /** Stored English reason or source, shown in the interface language. */
  const word = (stored: string | null) => corpusWord(stored, tr);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [queued, setQueued] = useState<Record<string, CorpusState>>({});
  const [busy, setBusy] = useState(false);

  const stateOf = (p: CorpusPost): CorpusState => queued[p.id] ?? p.state;
  const countsNow = (p: CorpusPost): boolean =>
    stateOf(p) === "included" && (p.countsTowardVoice || p.setAsideReason === "You set this aside");

  const filtered = useMemo(() => {
    const cutoff = new Date("2024-01-01").getTime();
    return posts.filter((p) => {
      if (filter === "aside") return !countsNow(p);
      if (filter === "arabic") return p.isArabic;
      if (filter === "old") return p.publishedAt !== null && new Date(p.publishedAt).getTime() < cutoff;
      return true;
    });
    // `queued` is intentionally not a dependency of the filter's identity: the
    // list must not reshuffle under the member's cursor as they tick boxes.
  }, [posts, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pendingCount = Object.keys(queued).length;

  const queue = (p: CorpusPost, next: CorpusState) =>
    setQueued((q) => {
      const copy = { ...q };
      if (p.state === next) delete copy[p.id];
      else copy[p.id] = next;
      return copy;
    });

  const apply = async () => {
    const include = Object.entries(queued).filter(([, s]) => s === "included").map(([id]) => id);
    const exclude = Object.entries(queued).filter(([, s]) => s === "excluded").map(([id]) => id);
    setBusy(true);
    try {
      await setCorpusStates(include, "included");
      await setCorpusStates(exclude, "excluded");
      setQueued({});
      await onApplied({ include, exclude });
    } catch (e) {
      toast.error(ar ? t("vo.tr.tApply") : e instanceof Error ? e.message : "Couldn't apply those changes.");
    } finally {
      setBusy(false);
    }
  };

  const reasonCounts = posts.reduce<Record<string, number>>((acc, p) => {
    if (p.countsTowardVoice || !p.setAsideReason) return acc;
    acc[p.setAsideReason] = (acc[p.setAsideReason] ?? 0) + 1;
    return acc;
  }, {});
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([reason, count]) => `${word(reason)} (${count})`);
  const reasonList = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const answerAr = ar
    ? t("vo.tr.read", { included: isoNum(includedCount) }).replace(/\.$/, "")
      + (excludedCount > 0
        ? t("vo.tr.aside", { excluded: isoNum(excludedCount) })
          + (reasonList.length ? t("vo.tr.reasons", { list: reasonList.map(([reason, count]) => t("vo.tr.reasonPiece", { reason: word(reason), count: isoNum(count) })).join("، ") }) : "")
        : "")
      + "."
    : "";
  const answer = ar ? answerAr : `KnownBy read ${includedCount} of your own posts.${excludedCount > 0 ? ` It set aside ${excludedCount}${topReasons.length ? `: ${topReasons.join(", ")}.` : "."}` : ""}`;

  return (
    <section style={{ marginBlockStart: 20 }}>
      <div style={cardStyle}>
        <div style={arStyle(lang, microLabel)}>{L("What KnownBy read", "vo.tr.title")}</div>
        <p style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, lineHeight: 1.5, marginBlock: "8px 4px" }}>
          {answer} {ambiguous.length === 0 ? L("Nothing else needs your attention.", "vo.tr.nothingElse") : ""}
        </p>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: 0 }}>
          {L("Take back anything that isn't your own writing.", "vo.tr.takeBack")}
        </p>

        {ambiguous.length > 0 && (
          <div style={{ marginBlockStart: 14, borderBlockStart: `1px solid ${LINE}`, paddingBlockStart: 12 }}>
            <div style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>
              {ar
                ? ambiguous.length === 1 ? t("vo.tr.unsureOne") : t("vo.tr.unsureMany", { n: isoNum(ambiguous.length) })
                : <>KnownBy wasn't sure about {ambiguous.length === 1 ? "this one" : `these ${ambiguous.length}`}. Is each one your own writing?</>}
            </div>
            {ambiguous.map((p) => {
              const s = stateOf(p);
              return (
                <div key={p.id} className="ta-row" style={{ padding: "10px 0", borderBlockStart: `1px solid ${LINE}` }}>
                  <span style={ar ? arStyle(lang, { fontSize: TYPE.small, color: MUTED }) : { ...monoNum, fontSize: TYPE.small, color: MUTED }}>{dateOf(p.publishedAt)} · {word(p.sourceLabel)}</span>
                  <p dir="auto" style={{ fontSize: TYPE.body, color: INK, margin: 0, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {p.excerpt}…
                  </p>
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button" className="vd-act"
                      style={s === "included" ? { borderColor: GREEN, color: GREEN } : undefined}
                      onClick={() => queue(p, "included")}
                    >
                      {L("Yes, mine", "vo.tr.yes")}
                    </button>
                    <button
                      type="button" className="vd-act"
                      style={s !== "included" ? { borderColor: INK, color: INK } : undefined}
                      onClick={() => queue(p, "excluded")}
                    >
                      {L("Not mine", "vo.tr.no")}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="vd-act"
          aria-expanded={open}
          style={{ marginBlockStart: 14 }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? L("Hide the full list", "vo.tr.hide") : ar ? t("vo.tr.see", { n: isoNum(posts.length) }) : `See everything KnownBy read (${nPosts(posts.length, "en")})`}
        </button>

        {open && (
          <div style={{ marginBlockStart: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([["all", "Everything"], ["aside", "Set aside"], ["arabic", "Arabic"], ["old", "Before 2024"]] as const).map(([k, label]) => (
                <button
                  key={k} type="button" className="vd-act"
                  aria-pressed={filter === k}
                  style={filter === k ? { borderColor: INK, color: INK } : undefined}
                  onClick={() => { setFilter(k); setPage(0); }}
                >
                  {L(label, `vo.tr.f${k[0].toUpperCase()}${k.slice(1)}`)}
                </button>
              ))}
            </div>

            <div style={{ marginBlockStart: 10, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
              {slice.map((p, i) => {
                const s = stateOf(p);
                const counted = countsNow(p);
                const chip = counted ? STATE_CHIP.included : STATE_CHIP.excluded;
                const changed = queued[p.id] !== undefined;
                return (
                  <label
                    key={p.id}
                    className="ta-row"
                    style={{
                      padding: "10px 14px", borderBlockStart: i === 0 ? "none" : `1px solid ${LINE}`,
                      background: changed ? "#F4F9FE" : "transparent", cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={s !== "included"}
                        onChange={(e) => queue(p, e.target.checked ? "excluded" : "included")}
                        aria-label={L(`Set aside the post from ${fmtDate(p.publishedAt)}`, "vo.tr.asideAria", { date: dateOf(p.publishedAt) })}
                        style={{ inlineSize: 18, blockSize: 18 }}
                      />
                      <span style={ar ? arStyle(lang, { fontSize: TYPE.small, color: MUTED }) : { ...monoNum, fontSize: TYPE.small, color: MUTED }}>{dateOf(p.publishedAt)} · {word(p.sourceLabel)}</span>
                    </span>
                    <span style={{ minInlineSize: 0 }}>
                      <span dir="auto" style={{ display: "block", fontSize: TYPE.body, color: INK, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                        {p.excerpt}…
                      </span>
                      <span style={ar ? arStyle(lang, { display: "block", fontSize: TYPE.caption, color: MUTED }) : { fontSize: TYPE.caption, color: MUTED }}>
                        {p.hookStyle ? (ar ? hookWord(p.hookStyle, tr) : HOOK_LABEL[p.hookStyle] ?? p.hookStyle) : L("Not classified yet", "vo.tr.unclassified")}
                        {!counted && p.setAsideReason ? ` · ${word(p.setAsideReason)}` : ""}
                      </span>
                    </span>
                    <span style={ar ? arStyle(lang, { ...chipStyle(chip.fg, chip.bg, chip.border), justifySelf: "start" }) : chipStyle(chip.fg, chip.bg, chip.border)}>{ar
                      ? counted ? t("vo.tr.counted") : p.setAsideReason ? t("vo.tr.setAsideR", { reason: word(p.setAsideReason) }) : t("vo.tr.setAside")
                      : counted ? chip.label : setAsideLabel(word(p.setAsideReason) || null)}</span>
                  </label>
                );
              })}
              {slice.length === 0 && (
                <p style={{ fontSize: TYPE.body, color: MUTED, padding: "14px" }}>{L("Nothing matches that filter.", "vo.tr.noMatch")}</p>
              )}
            </div>

            {pages > 1 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBlockStart: 10 }}>
                <button type="button" className="vd-act" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>{L("Previous", "vo.tr.prev")}</button>
                <span dir="ltr" style={{ ...monoNum, fontSize: TYPE.small, color: MUTED }}>{page + 1} / {pages}</span>
                <button type="button" className="vd-act" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>{L("Next", "vo.tr.next")}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <div
          role="status"
          style={{
            position: "sticky", insetBlockEnd: 12, marginBlockStart: 12, display: "flex", gap: 10,
            alignItems: "center", flexWrap: "wrap", ...cardStyle, boxShadow: "0 8px 24px rgba(15,21,25,.12)",
          }}
        >
          <span style={{ fontSize: TYPE.body, color: INK }}>
            {ar ? t("vo.tr.pending", { n: isoNum(pendingCount) }) : <>{pendingCount} {pendingCount === 1 ? "change" : "changes"} waiting. KnownBy re-reads your patterns once, when you apply.</>}
          </span>
          <span style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
            <button type="button" style={ghostButton} onClick={() => setQueued({})} disabled={busy}>{L("Cancel", "vo.tr.cancel")}</button>
            <button type="button" style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }} onClick={() => void apply()} disabled={busy}>
              {busy ? L("Applying…", "vo.tr.applying") : L("Apply", "vo.tr.apply")}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
