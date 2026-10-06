/**
 * How you open and close a post.
 *
 * Every figure comes from `voice_window()`, `voice_opener_diversity()` and
 * `voice_top_style_share()` via the loader — nothing is recounted here. The
 * reading is one sentence from the shared generator, so this page cannot
 * disagree with any other.
 *
 * The section is not a report: each row can be turned off, and that writes the
 * two keys generation already reads — `vocabulary_preferences.prefs.openings`
 * and `allowed_endings` — on the profile row this page is showing. Every key
 * crosses the boundary through the one map in `voiceOptions.ts`.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AMBER_TEXT, BLUE, INK, LINE, MUTED, RADIUS, SURFACE, TAP, TYPE,
  chipStyle, cardStyle, microLabel, monoNum,
} from "@/components/voice/tokens";
import InfoTooltip from "@/components/voice/InfoTooltip";
import { REPETITION_GATES } from "@/lib/voiceGates";
import { variationSummary } from "@/lib/voiceOverview";
import { ENDING_KEYS, ENDING_NAME, HOOK_KEYS, HOOK_NAME, type VoiceDnaModel } from "@/lib/voiceDna";
import { storedEndingKey, storedOpenerKey, uiEndingKey, uiOpenerKey } from "@/components/voice/voiceOptions";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { arStyle } from "@/lib/arDisplay";
import { endingWord, hookWord, type VoiceTr } from "@/lib/voiceText";

/** A one-line definition for every opener and closer. None of them are self-evident. */
const DEFINITION: Record<string, string> = {
  contrarian_claim: "You open by disagreeing with something the field takes for granted.",
  number_first: "You open with a figure — a result, a cost, a percentage.",
  short_story: "You open with a scene: a moment, a room, a conversation.",
  question: "You open by asking the reader something.",
  experience_led: "You open with something that happened to you.",
  announcement: "You open by stating news — a launch, a move, a result.",
  other: "Openings that don't match any of the six named styles.",
  suspended: "You end on an unfinished line the reader completes.",
  reframe: "You end by restating the idea in a different frame.",
  equation: "You end with a formula or a trade-off.",
  number: "You end on a figure.",
  cta: "You end by asking the reader to do something.",
};

function Rows({ axis, keys, names, dist, total, topKey, enabled, busy, onToggle }: {
  axis: "open" | "close";
  keys: string[]; names: Record<string, string>; dist: Record<string, number>; total: number; topKey: string | null;
  /** UI keys currently switched on. `null` while the profile is still loading. */
  enabled: string[] | null;
  busy: boolean;
  onToggle: (uiKey: string, on: boolean) => void;
}) {
  const { lang, t } = useLanguage();
  const ar = lang === "ar";
  const L = (en: string, k: string, p?: Record<string, unknown>) => (ar ? t(k, p) : en);
  const tr: VoiceTr = { lang, t };
  const nameOf = (k: string) => (ar ? (axis === "open" ? hookWord(k, tr) : endingWord(k, tr)) : names[k]);
  // Closer definitions come from their own keys; openers keep the inline English.
  const defOf = (k: string): string | undefined => {
    const key = `vo.def.${axis}.${k}`;
    const v = t(key);
    if (ar || axis === "close") return v && v !== key ? v : undefined;
    return DEFINITION[k];
  };
  return (
    <div style={{ marginBlockStart: 10 }}>
      {keys.map((k) => {
        const n = dist[k] ?? 0;
        const share = total === 0 ? 0 : Math.round((n / total) * 100);
        const isTop = k === topKey && share > REPETITION_GATES.topShareCeiling;
        // `other` is a bucket, not a style: it can never be switched.
        const switchable = k !== "other";
        const on = enabled === null ? true : enabled.includes(k);
        return (
          <div key={k} className="ve-row" style={{ padding: "10px 0", borderBlockStart: `1px solid ${LINE}` }}>
            <span style={{ minInlineSize: 0, display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{
                fontSize: TYPE.body, color: on ? INK : MUTED,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {nameOf(k)}
              </span>
              {defOf(k) && <InfoTooltip term={nameOf(k)} body={defOf(k) as string} />}
            </span>
            <span aria-hidden style={{ minInlineSize: 0, blockSize: 6, borderRadius: RADIUS.rail, background: SURFACE, overflow: "hidden" }}>
              <span style={{ display: "block", blockSize: "100%", inlineSize: `${share}%`, background: isTop ? AMBER_TEXT : BLUE, borderRadius: RADIUS.rail }} />
            </span>
            <span className="ve-tail">
              <span style={{ textAlign: "end" }}>
                <span dir="ltr" style={{ ...monoNum, display: "block", fontSize: TYPE.title, fontWeight: 600, color: INK }}>{share}%</span>
                <span style={{ fontSize: TYPE.caption, color: MUTED }}>{L(`${n} of ${total} posts`, "vo.ve.nOf", { n, total })}</span>
              </span>
              <span style={{ textAlign: "end" }}>
                {isTop && <span style={{ ...chipStyle(AMBER_TEXT, "#FBF4E4", "#F0DFB4"), whiteSpace: "nowrap" }}>{L(`Overused · ${share}%`, "vo.ve.overused", { share })}</span>}
                {n === 0 && <span style={arStyle(lang, { ...chipStyle(MUTED, SURFACE), whiteSpace: "nowrap" })}>{L("Never used", "vo.ve.never")}</span>}
              </span>
              {switchable && (
                <button
                  type="button"
                  className="vd-act"
                  role="switch"
                  aria-checked={on}
                  aria-label={on ? L(`${names[k]} — on`, "vo.ve.switchOn", { name: nameOf(k) }) : L(`${names[k]} — off`, "vo.ve.switchOff", { name: nameOf(k) })}
                  disabled={busy || enabled === null}
                  onClick={() => onToggle(k, !on)}
                  style={{ minBlockSize: TAP, color: on ? BLUE : MUTED, whiteSpace: "nowrap" }}
                >
                  {on ? L("On", "vo.ve.on") : L("Off", "vo.ve.off")}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function VariationEngine({ model, busy = false, onMutate }: {
  model: VoiceDnaModel;
  busy?: boolean;
  /** The page's optimistic-then-rollback writer. Absent in the harness. */
  onMutate?: (run: () => Promise<void>) => void;
}) {
  const { lang, t } = useLanguage();
  const ar = lang === "ar";
  const L = (en: string, k: string, p?: Record<string, unknown>) => (ar ? t(k, p) : en);
  const tr: VoiceTr = { lang, t };
  const [tab, setTab] = useState<"openers" | "closers">("openers");
  const thin = model.windowClassified < REPETITION_GATES.minClassified;
  const summary = variationSummary(model, tr);
  const profileId = model.activeProfileId;

  /** UI keys switched on. Empty preference means every style is allowed. */
  const [openers, setOpeners] = useState<string[] | null>(null);
  const [closers, setClosers] = useState<string[] | null>(null);

  const allOpeners = HOOK_KEYS.filter((k) => k !== "other");
  const allClosers = ENDING_KEYS.filter((k) => k !== "other");

  useEffect(() => {
    let cancelled = false;
    if (!profileId) { setOpeners(null); setClosers(null); return; }
    void (async () => {
      const { data } = await supabase
        .from("authority_voice_profiles")
        .select("vocabulary_preferences, allowed_endings")
        .eq("id", profileId)
        .maybeSingle();
      if (cancelled) return;
      const prefs = (data?.vocabulary_preferences ?? null) as { prefs?: { openings?: unknown } } | null;
      const storedOpen = Array.isArray(prefs?.prefs?.openings) ? (prefs?.prefs?.openings as unknown[]) : [];
      const storedEnd = Array.isArray(data?.allowed_endings) ? (data?.allowed_endings as unknown[]) : [];
      const mappedOpen = storedOpen.map((v) => uiOpenerKey(String(v))).filter((v): v is string => Boolean(v));
      const mappedEnd = storedEnd.map((v) => uiEndingKey(String(v))).filter((v): v is string => Boolean(v));
      setOpeners(mappedOpen.length ? mappedOpen : allOpeners);
      setClosers(mappedEnd.length ? mappedEnd : allClosers);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const toggle = useCallback((axis: "openers" | "closers", uiKey: string, on: boolean) => {
    if (!profileId || !onMutate) return;
    const current = axis === "openers" ? openers : closers;
    const all = axis === "openers" ? allOpeners : allClosers;
    const from = current ?? all;
    const next = on ? [...from, uiKey].filter((v, i, a) => a.indexOf(v) === i) : from.filter((v) => v !== uiKey);
    if (next.length === 0) {
      toast.error(L("Keep at least one style on — KnownBy needs somewhere to start.", "vo.ve.keepOne"));
      return;
    }
    const ordered = all.filter((k) => next.includes(k));
    const prev = current;
    if (axis === "openers") setOpeners(ordered); else setClosers(ordered);
    onMutate(async () => {
      try {
        if (axis === "openers") {
          const stored = ordered.map(storedOpenerKey).filter((v): v is string => Boolean(v));
          const { data: row } = await supabase
            .from("authority_voice_profiles").select("vocabulary_preferences").eq("id", profileId).maybeSingle();
          const existing = (row?.vocabulary_preferences ?? {}) as Record<string, unknown>;
          const existingPrefs = (existing.prefs ?? {}) as Record<string, unknown>;
          const { error } = await supabase
            .from("authority_voice_profiles")
            .update({ vocabulary_preferences: { ...existing, prefs: { ...existingPrefs, openings: stored } } })
            .eq("id", profileId);
          if (error) throw error;
        } else {
          const stored = ordered.map(storedEndingKey).filter((v): v is string => Boolean(v));
          const { error } = await supabase
            .from("authority_voice_profiles")
            .update({ allowed_endings: stored })
            .eq("id", profileId);
          if (error) throw error;
        }
      } catch (e) {
        // The page rolls its own model back; this local switch rolls back too.
        if (axis === "openers") setOpeners(prev); else setClosers(prev);
        throw e;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, onMutate, openers, closers, allOpeners, allClosers, lang]);

  // `other` is the unclassified bucket, not a closing style — the database
  // function excludes it from the top share, and so does this sentence.
  const namedEndings = Object.entries(model.endingDist).filter(([k]) => k !== "other");
  const topCloser = namedEndings.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const closerShare = model.endingClassified === 0 || !topCloser
    ? null
    : Math.round(((model.endingDist[topCloser] ?? 0) / model.endingClassified) * 100);

  const activeCount = tab === "openers" ? model.windowClassified : model.endingClassified;
  const noun = tab === "openers" ? "opening" : "closing";
  const subtitle = activeCount === 0
    ? L(`KnownBy hasn't been able to name the ${noun} style on any of your recent posts yet.`, tab === "openers" ? "vo.ve.noneOpen" : "vo.ve.noneClose")
    : L(`KnownBy sorted your last ${activeCount} posts into seven ${noun} styles. Too much of one and your feed starts to sound the same.`, tab === "openers" ? "vo.ve.sortedOpen" : "vo.ve.sortedClose", { n: activeCount });

  return (
    <section style={{ marginBlockStart: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ maxInlineSize: 520 }}>
            <div style={arStyle(lang, microLabel)}>{L("How you open and close", "vo.var.title")}</div>
            <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 0" }}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", gap: 14 }} role="tablist" aria-label={L("Openers or closers", "vo.ve.tabsAria")}>
            {(["openers", "closers"] as const).map((tb) => (
              <button
                key={tb} type="button" role="tab" aria-selected={tab === tb} onClick={() => setTab(tb)}
                style={{
                  background: "transparent", border: "none", padding: "0 2px", minBlockSize: TAP, cursor: "pointer",
                  fontSize: TYPE.body, fontWeight: 600, color: tab === tb ? BLUE : MUTED,
                  borderBlockEnd: tab === tb ? `2px solid ${BLUE}` : "2px solid transparent",
                }}
              >
                {tb === "openers" ? L("Openers", "vo.ve.openers") : L("Closers", "vo.ve.closers")}
              </button>
            ))}
          </div>
        </div>

        {thin ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
            {L(`Not enough posts yet — KnownBy needs ${REPETITION_GATES.minClassified} to read your patterns.`, "vo.ve.thin", { min: REPETITION_GATES.minClassified })}
          </p>
        ) : tab === "openers" ? (
          <>
            <Rows
              axis="open" keys={HOOK_KEYS} names={HOOK_NAME} dist={model.windowDist} total={model.windowClassified}
              topKey={model.topStyleKey} enabled={openers} busy={busy} onToggle={(k, on) => toggle("openers", k, on)}
            />
            {summary && (
              <p style={{ fontSize: TYPE.bodyLg, color: INK, lineHeight: 1.65, marginBlockStart: 12, marginBlockEnd: 0 }}>{summary}</p>
            )}
          </>
        ) : (
          <>
            <Rows
              axis="close" keys={ENDING_KEYS} names={ENDING_NAME} dist={model.endingDist} total={model.endingClassified}
              topKey={topCloser} enabled={closers} busy={busy} onToggle={(k, on) => toggle("closers", k, on)}
            />
            <p style={{ fontSize: TYPE.bodyLg, color: INK, lineHeight: 1.65, marginBlockStart: 12, marginBlockEnd: 0 }}>
              {model.endingClassified === 0
                ? L("None of your recent posts have a labelled ending yet.", "vo.ve.endNone")
                : closerShare === null || topCloser === null
                  ? L("KnownBy couldn't name the ending on most of these.", "vo.ve.endUnknown")
                  : L(`${closerShare}% of your posts end with ${(ENDING_NAME[topCloser] ?? "").toLowerCase()}, and healthy is ${REPETITION_GATES.topShareCeiling}% or less.`, "vo.ve.endShare", { share: closerShare, ending: endingWord(topCloser, tr), ceiling: REPETITION_GATES.topShareCeiling })}
            </p>
          </>
        )}

        {!thin && (
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, marginBlockStart: 10, marginBlockEnd: 0 }}>
            {L("Turn a style off and KnownBy stops choosing it. Your posts are unchanged.", "vo.ve.turnOff")}
          </p>
        )}
      </div>
    </section>
  );
}
