/**
 * Your Voice — what Aura believes about how you write, and the controls to
 * correct it.
 *
 * Overview and DNA used to be two pages describing the same object at two zoom
 * levels, which is why the variation fact appeared three times. They are one
 * page now: the state at the top, the controls beneath it, and the variation
 * reading in exactly one place.
 *
 * The page owns no arithmetic. Every figure arrives from `loadVoiceOverview`
 * and `loadVoiceDna`, both read through the shared cache.
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import VoiceMicBadge from "@/components/voice/VoiceMicBadge";
import SpectrumRow from "@/components/voice/SpectrumRow";
import VoiceModes from "@/components/voice/VoiceModes";
import VoiceRules from "@/components/voice/VoiceRules";
import VariationEngine from "@/components/voice/VariationEngine";
import WhatWorked from "@/components/voice/WhatWorked";
import InfoTooltip from "@/components/voice/InfoTooltip";
import {
  AMBER_TEXT, BLUE, CYAN, CYAN_TEXT, GREEN, INK, LINE, MUTED, NIGHT, NIGHT_LINE, NIGHT_MUTED,
  RADIUS, RED, SURFACE, TYPE, WHITE, cardStyle, ghostButton, microLabel, monoNum, primaryButton,
} from "@/components/voice/tokens";
import { REPETITION_GATES } from "@/lib/voiceGates";
import { useCachedVoice, invalidateVoiceCache } from "@/lib/voiceCache";
import {
  loadVoiceOverview, dismissRecommendation, readinessSentence, HOOK_LABEL,
  READINESS_LABEL, READINESS_ORDER, type VoiceOverviewModel, type Readiness,
} from "@/lib/voiceOverview";
import {
  MODE_DEFS, addRule, confirmTrait, createMode, deleteMode, deleteRule, loadVoiceDna, rejectTrait,
  reorderRules, restoreLearned, setTraitLock, setTraitValue, updateRuleKind, updateRuleText,
  acceptSuggestion, dismissSuggestion, runSuggestRules,
  type DnaRule, type DnaTrait, type VoiceDnaModel,
} from "@/lib/voiceDna";

const GROUP_LABEL: Record<string, string> = {
  sound: "How you sound", structure: "How you build a post", language: "Language",
};

export interface YourVoiceModel { overview: VoiceOverviewModel; dna: VoiceDnaModel }

/* ── health ──────────────────────────────────────────────────────────────── */

type Band = "good" | "watch" | "weak";
const BAND_COLOUR: Record<Band, string> = { good: GREEN, watch: AMBER_TEXT, weak: RED };

interface Health {
  label: string;
  define: string;
  value: number | null;
  unit: string;
  explain: string;
  band: Band;
  fill: number | null;
  unknownText: string;
  secondary?: string;
}

function HealthCard({ h }: { h: Health }) {
  const colour = BAND_COLOUR[h.band];
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={microLabel}>{h.label}</span>
        <InfoTooltip term={h.label} body={h.define} />
      </div>
      {h.value === null ? (
        <div style={{ fontSize: TYPE.title, fontWeight: 600, color: MUTED, marginBlockStart: 8 }}>{h.unknownText}</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBlockStart: 8 }}>
          <span style={{ ...monoNum, fontSize: TYPE.figure, fontWeight: 700, color: colour, lineHeight: 1 }}>{h.value}</span>
          <span style={{ ...monoNum, fontSize: TYPE.small, fontWeight: 600, color: colour }}>{h.unit}</span>
        </div>
      )}
      {h.secondary && <div style={{ ...monoNum, fontSize: TYPE.caption, color: MUTED, marginBlockStart: 6 }}>{h.secondary}</div>}
      <div aria-hidden style={{ blockSize: 4, borderRadius: RADIUS.rail, background: SURFACE, marginBlockStart: 12, overflow: "hidden" }}>
        {h.fill !== null && (
          <div style={{ blockSize: "100%", inlineSize: `${Math.max(2, Math.min(100, h.fill * 100))}%`, background: colour, borderRadius: RADIUS.rail }} />
        )}
      </div>
      <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.5, marginBlockStart: 10, marginBlockEnd: 0 }}>{h.explain}</p>
    </div>
  );
}

export function buildHealth(m: VoiceOverviewModel): Health[] {
  const coverage: Health = {
    label: "Evidence coverage",
    define: "How many of your own posts Aura has read. Reposts and comments don't count.",
    value: m.corpusCount,
    unit: m.corpusCount === 1 ? "post" : "posts",
    explain: `${m.corpusCount} ${m.corpusCount === 1 ? "post" : "posts"} read. 30 is the threshold for reliable.`,
    band: m.corpusCount >= 30 ? "good" : m.corpusCount >= 8 ? "watch" : "weak",
    fill: Math.min(1, m.corpusCount / 30),
    unknownText: "Nothing read yet",
  };

  const fresh: Health = {
    label: "Freshness",
    define: "Days since your newest post. How you write drifts, so old writing is weaker evidence.",
    value: m.freshnessDays,
    unit: m.freshnessDays === 1 ? "day" : "days",
    explain: m.freshnessDays === null
      ? "No dated sample yet. Voice drifts after about 90 days."
      : "Since your newest sample. Voice drifts after about 90 days.",
    band: m.freshnessDays === null ? "weak" : m.freshnessDays < 45 ? "good" : m.freshnessDays <= 90 ? "watch" : "weak",
    fill: m.freshnessDays === null ? null : Math.min(1, m.freshnessDays / 90),
    unknownText: "No dated posts yet",
  };

  const notHigh = m.traits.filter((t) => t.computable && t.confidence !== "high");
  const notHighNames = notHigh.map((t) => t.display_name.toLowerCase());
  const targets = notHigh.map((t) =>
    t.evidence_count === null ? null : Math.max(1, (t.confidence === "low" ? t.min_evidence : t.min_evidence * 2) - t.evidence_count),
  );
  const estimate = targets.length && targets.every((v) => v !== null) ? Math.max(...(targets as number[])) : null;
  const consistencyDetail = notHighNames.length === 0
    ? ""
    : ` ${notHighNames.join(" and ").replace(/^./, (c) => c.toUpperCase())} ${notHighNames.length === 1 ? "is" : "are"} not yet high confidence${estimate === null ? "." : ` — about ${estimate} more of your posts would settle ${notHighNames.length === 1 ? "it" : "them"}.`}`;

  const consistency: Health = {
    label: "Consistency",
    define: "How much your posts agree with each other. Aura counts a measure as settled only when they do.",
    value: m.computableComputed === 0 ? null : m.computableHigh,
    unit: `of ${m.computableComputed}`,
    explain: m.computableComputed === 0
      ? "Aura has not measured any traits yet."
      : `Your posts agree with each other on ${m.computableHigh} of ${m.computableComputed} measured traits.${consistencyDetail}`,
    band: m.computableComputed === 0
      ? "weak"
      : m.computableHigh / m.computableComputed >= 0.8 ? "good"
      : m.computableHigh / m.computableComputed >= 0.5 ? "watch" : "weak",
    fill: m.computableComputed === 0 ? null : m.computableHigh / m.computableComputed,
    unknownText: "Not enough posts yet",
  };

  const divBand: Band = m.diversity === null ? "weak"
    : m.diversity >= REPETITION_GATES.diversityFloor ? "good" : m.diversity >= 50 ? "watch" : "weak";
  const shareBand: Band = m.topShare === null ? "weak"
    : m.topShare <= REPETITION_GATES.topShareCeiling ? "good" : m.topShare <= 45 ? "watch" : "weak";
  const worst: Band = [divBand, shareBand].includes("weak") ? "weak" : [divBand, shareBand].includes("watch") ? "watch" : "good";
  const topName = m.topStyleKey ? (HOOK_LABEL[m.topStyleKey] ?? m.topStyleKey).replace(/^(a|an|your own) /, "") : null;

  const distinctiveness: Health = {
    label: "Distinctiveness",
    define: "How much your openings vary. One opening used too often makes every post read the same.",
    value: m.diversity === null ? null : Math.round(m.diversity),
    unit: "%",
    secondary: m.topShare === null || !topName || m.topStyleCount === null
      ? undefined
      : `Top opener ${Math.round(m.topShare)}% — ${topName}, ${m.topStyleCount} of ${m.windowClassified}`,
    explain: m.diversity === null
      ? `Opener variety needs ${REPETITION_GATES.minClassified} classified posts in your recent window. You have ${m.windowClassified}.`
      : `How much your openers vary. Distinctive needs ${REPETITION_GATES.diversityFloor}% diversity and no single opener above ${REPETITION_GATES.topShareCeiling}%.`,
    band: worst,
    fill: m.diversity === null ? null : m.diversity / 100,
    unknownText: "Not enough posts yet",
  };

  return [coverage, fresh, consistency, distinctiveness];
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
};

function ReadinessRail({ readiness }: { readiness: Readiness }) {
  const idx = Math.max(0, READINESS_ORDER.indexOf(readiness));
  return (
    <div style={{ marginBlockStart: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {READINESS_ORDER.map((r, i) => (
          <div key={r} style={{ flex: 1, blockSize: 4, borderRadius: RADIUS.rail, background: i <= idx ? CYAN : NIGHT_LINE }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBlockStart: 8 }}>
        {READINESS_ORDER.map((r, i) => (
          <span
            key={r}
            style={{
              ...monoNum, flex: 1, fontSize: TYPE.micro, textTransform: "uppercase", letterSpacing: ".08em",
              color: i === idx ? WHITE : NIGHT_MUTED, fontWeight: i === idx ? 700 : 400,
            }}
          >
            {READINESS_LABEL[r]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function YourVoice({
  userId, onNavigate, modelOverride,
}: {
  userId: string | null;
  onNavigate: (tab: "voice" | "teach" | "test") => void;
  /** Harness only: render a known model instead of reading the database. */
  modelOverride?: YourVoiceModel;
}) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Collapse state lives above every early return, and is remembered per member.
  const storeKey = userId ? `aura:yourvoice:groups:${userId}` : null;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => loadCollapseState(storeKey));
  const setGroup = useCallback((id: string, value: boolean) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: value };
      saveCollapseState(storeKey, next);
      return next;
    });
  }, [storeKey]);
  const setAllGroups = useCallback((ids: string[], value: boolean) => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = value;
      saveCollapseState(storeKey, next);
      return next;
    });
  }, [storeKey]);


  const key = modelOverride || !userId ? null : `voice:yourvoice:${userId}:${profileId ?? "active"}`;
  const loader = useCallback(async (): Promise<YourVoiceModel> => {
    const [overview, dna] = await Promise.all([
      loadVoiceOverview(userId as string),
      loadVoiceDna(userId as string, profileId),
    ]);
    return { overview, dna };
  }, [userId, profileId]);

  const state = useCachedVoice<YourVoiceModel>(key, loader);
  const model = modelOverride ?? state.data;

  /** Optimistic write with rollback. One reload, and never a stale one. */
  const mutate = useCallback(async (next: VoiceDnaModel, run: () => Promise<void>) => {
    if (!model) return;
    const prev = model;
    state.set({ ...model, dna: next });
    setBusy(true);
    try {
      await run();
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      console.error("[YourVoice] save failed", e);
      state.set(prev);
      // Say the real reason. A duplicate mode and a mode the database does not
      // allow are two different member problems, not one generic failure.
      const code = (e as { code?: string } | null)?.code;
      const message = (e as { message?: string } | null)?.message;
      if (code === "23505") toast.error("You already have that mode in this language.");
      else if (code === "23514") toast.error("That mode isn't available yet.");
      else if (message && message.startsWith("Your default voice")) toast.error(message);
      else toast.error("Couldn't save that. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }, [model, state]);

  const patchTrait = (m: VoiceDnaModel, key2: string, patch: Partial<DnaTrait>): VoiceDnaModel => ({
    ...m, traits: m.traits.map((t) => (t.trait_key === key2 ? { ...t, ...patch } : t)),
  });

  const grouped = useMemo(() => {
    const out = new Map<string, DnaTrait[]>();
    for (const t of model?.dna.traits ?? []) {
      const list = out.get(t.group_key) ?? [];
      list.push(t);
      out.set(t.group_key, list);
    }
    return [...out.entries()];
  }, [model]);

  if (!userId && !modelOverride) {
    return <div style={{ ...cardStyle, fontSize: TYPE.body, color: MUTED }}>Sign in to see your voice.</div>;
  }
  if (state.loading && !model) {
    return <div style={{ fontSize: TYPE.body, color: MUTED, padding: "24px 0" }}>Reading your voice…</div>;
  }
  // An error is not an empty corpus, and must never be reported as one.
  if (state.error && !model) {
    return (
      <div style={{ ...cardStyle, borderColor: "#EED3CF" }}>
        <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK }}>Aura couldn't load your voice.</div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 12px" }}>
          Your writing is safe — this is a connection problem, not an empty file. {state.error}
        </p>
        <button type="button" style={primaryButton} onClick={() => void state.reload(true)}>Try again</button>
      </div>
    );
  }
  if (!model) return null;

  const ov = model.overview;
  const dna = model.dna;
  const nothingRead = ov.corpusCount === 0 && !dna.hasProfile;
  const reco = ov.recommendation;
  const showReco = !ov.recommendationDismissed && !dismissed && !nothingRead && reco.key !== "none";

  /* ── the one-line readings. Every figure is already loaded; if a figure is
     unknown the line says so in words rather than printing a zero. ───────── */
  const healthCards = buildHealth(ov);
  const healthWeak = healthCards.some((h) => h.band === "weak");
  const readPart = ov.corpusCount === 0
    ? "Nothing read from your posts yet"
    : `Read from ${ov.corpusCount} of your posts`;
  const freshPart = ov.freshnessDays === null
    ? "no dated post yet"
    : `newest ${ov.freshnessDays} ${ov.freshnessDays === 1 ? "day" : "days"} ago`;
  const markerPart = ov.computableComputed === 0
    ? "no markers measured yet"
    : `${ov.computableHigh} of ${ov.computableComputed} markers measured`;
  const openingPart = ov.diversity === null
    ? "opening variety not measured yet"
    : `openings vary ${Math.round(ov.diversity)}%`;
  const healthLine = `${readPart} · ${freshPart} · ${markerPart} · ${openingPart}`;

  const modesSet = dna.modes.filter((m) => m.profileId);
  const activeMode = modesSet.find((m) => m.profileId === dna.activeProfileId);
  const modesLine = `${modesSet.length} ${modesSet.length === 1 ? "mode" : "modes"} · ${activeMode ? activeMode.label : "no mode chosen"}`;

  const countKind = (k: string) => dna.rules.filter((r) => r.kind === k).length;
  const waiting = dna.suggestions.length;
  const rulesLine = `${countKind("always")} always · ${countKind("never")} never · ${countKind("anchor")} anchors · ${waiting} waiting for you`;

  const variationLine = variationSummary(dna) ?? "Opening variety is not measured yet.";

  const unconfirmedProposal = dna.traits.some((t) => t.source === "aura" && !t.last_confirmed_at && t.value !== null);

  const groupSummary = (traits: DnaTrait[]) => {
    const measured = traits.filter((t) => t.value !== null);
    if (measured.length === 0) return "Nothing measured yet in this group.";
    const names = measured.map((t) => t.display_name.toLowerCase()).join(", ");
    return `${names.replace(/^./, (c) => c.toUpperCase())} — ${measured.length} of ${traits.length} read from your posts`;
  };

  /** A group with something waiting for the member opens by default. */
  const attention: Record<string, boolean> = {
    health: healthWeak,
    modes: false,
    rules: waiting > 0,
    variation: false,
    worked: unconfirmedProposal,
  };
  for (const [group, traits] of grouped) {
    attention[`believe:${group}`] = traits.some((t) => t.source === "aura" && !t.last_confirmed_at && t.value !== null);
  }
  const groupIds = Object.keys(attention);
  const isGroupOpen = (id: string) => openGroups[id] ?? attention[id] ?? false;


  if (nothingRead) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: TYPE.section, fontWeight: 600, color: INK }}>Aura hasn't read anything you've written yet.</div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 14px" }}>
          There is no voice to show until Aura has some of your writing to read.
        </p>
        <button type="button" style={primaryButton} onClick={() => onNavigate("teach")}>Teach Aura</button>
      </div>
    );
  }

  return (
    <div dir="ltr" style={{ color: INK }}>
      <CollapseStyles />

      {/* Open or close the whole pane in one press. */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBlockEnd: 10 }}>
        <button type="button" style={ghostButton} onClick={() => setAllGroups(groupIds, true)}>Expand all</button>
        <button type="button" style={ghostButton} onClick={() => setAllGroups(groupIds, false)}>Collapse all</button>
      </div>

      <div className="cb-grid">
      {/* 1 — readiness and health: one block. The hero stays open; the four
          cards sit behind one live reading. */}
      <div className="cb-span">
      <section style={{ background: NIGHT, borderRadius: RADIUS.hero, padding: "20px 22px", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <VoiceMicBadge size={56} />
        <div style={{ flex: 1, minInlineSize: 240 }}>
          <div style={{ ...microLabel, color: NIGHT_MUTED, letterSpacing: ".18em" }}>Voice readiness</div>
          <h2 style={{ fontSize: TYPE.display, fontWeight: 700, color: WHITE, margin: "4px 0 0" }}>
            {READINESS_LABEL[ov.readiness]}
          </h2>
          <p style={{ fontSize: TYPE.body, lineHeight: 1.6, color: NIGHT_MUTED, marginBlock: "6px 0", maxInlineSize: 620 }}>
            {readinessSentence(ov)}
          </p>
          <ReadinessRail readiness={ov.readiness} />
        </div>
      </section>

      {/* 2 — health */}
      <div style={{ marginBlockStart: 12 }}>
        <CollapseBlock
          id="voice-health"
          label="Voice health"
          summary={healthLine}
          controlLabel="Details"
          open={isGroupOpen("health")}
          onToggle={() => setGroup("health", !isGroupOpen("health"))}
        >
          <div className="vo-health" style={{ marginBlockStart: 4, marginBlockEnd: 4 }}>
            {healthCards.map((h) => <HealthCard key={h.label} h={h} />)}
          </div>
        </CollapseBlock>
      </div>
      </div>

      {showReco && (
        <div className="cb-span" style={{ ...cardStyle }}>

          <div style={microLabel}>Top recommendation</div>
          <p dir="auto" style={{ fontSize: TYPE.bodyLg, lineHeight: 1.6, color: INK, marginBlock: "8px 0" }}>{reco.text}</p>
          <div style={{ display: "flex", gap: 8, marginBlockStart: 12, flexWrap: "wrap" }}>
            {reco.actionLabel && reco.actionTab && reco.actionTab !== "voice" && (
              <button type="button" style={primaryButton} onClick={() => onNavigate(reco.actionTab as "teach" | "test")}>
                {reco.actionLabel}
              </button>
            )}
            <button
              type="button"
              style={ghostButton}
              onClick={async () => { setDismissed(true); if (userId) await dismissRecommendation(userId, reco.key); }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* 3 — the spectrums, one collapsible group each */}
      <header className="cb-span" style={{ marginBlockStart: 8 }}>
        <h2 style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, margin: 0 }}>
          What Aura believes about how you write
        </h2>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "4px 0" }}>
          Drag any marker to correct it. Aura keeps learning the ones you leave alone.
        </p>
      </header>
      {grouped.map(([group, traits]) => (
        <CollapseBlock
          key={group}
          id={`believe-${group}`}
          label={GROUP_LABEL[group] ?? group}
          summary={groupSummary(traits)}
          controlLabel="Adjust"
          open={isGroupOpen(`believe:${group}`)}
          onToggle={() => setGroup(`believe:${group}`, !isGroupOpen(`believe:${group}`))}
        >
          <div style={{ marginBlockEnd: 8 }}>

            {traits.map((t) => (
              <SpectrumRow
                key={t.trait_key}
                trait={t}
                busy={busy}
                onSet={(v) => {
                  if (!userId || !dna.activeProfileId) return;
                  void mutate(
                    patchTrait(dna, t.trait_key, { value: v, source: "user", confidence: "high", last_confirmed_at: new Date().toISOString() }),
                    () => setTraitValue(userId, dna.activeProfileId as string, t, v),
                  );
                }}
                onLock={() => {
                  if (!t.id) return;
                  void mutate(patchTrait(dna, t.trait_key, { locked: !t.locked }), () => setTraitLock(t.id as string, !t.locked));
                }}
                onRestore={() => {
                  if (!t.id || t.learned_value === null) return;
                  void mutate(
                    patchTrait(dna, t.trait_key, { value: t.learned_value, source: "learned" }),
                    () => restoreLearned(t.id as string, t.learned_value as number),
                  );
                }}
                onConfirm={() => {
                  if (!t.id) return;
                  void mutate(
                    patchTrait(dna, t.trait_key, { last_confirmed_at: new Date().toISOString() }),
                    () => confirmTrait(t.id as string),
                  );
                }}
                onReject={() => {
                  if (!userId || !dna.activeProfileId) return;
                  void mutate(
                    patchTrait(dna, t.trait_key, { value: null, source: null, confidence: null, id: null }),
                    () => rejectTrait(userId, dna.activeProfileId as string, t),
                  );
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 4 — modes */}
      <VoiceModes
        modes={dna.modes}
        activeProfileId={dna.activeProfileId}
        busy={busy}
        onSelect={(id) => setProfileId(id)}
        onCreate={(k) => {
          const def = MODE_DEFS.find((d) => d.key === k);
          if (!def || !userId) return;
          void mutate(dna, async () => {
            const { profileId: created, needsEvidence } = await createMode(userId, def, dna.traits, dna.activeLanguage);
            setProfileId(created);
            toast.success(needsEvidence
              ? `${def.label} created — some shifts were clamped to what your posts prove, so it needs evidence.`
              : `${def.label} created from your measured voice.`);
          });
        }}
        onRemove={(m) => {
          if (!m.profileId) return;
          void mutate(dna, async () => {
            await deleteMode(m.profileId as string);
            if (dna.activeProfileId === m.profileId) setProfileId(null);
            toast.success(`${m.label} removed. Your default voice is unchanged.`);
          });
        }}
      />

      {/* 5 — rules */}
      <VoiceRules
        rules={dna.rules}
        suggestions={dna.suggestions}
        canSuggest={model.overview.corpusCount >= 20}
        busy={busy}
        onAccept={(r) => void mutate(
          { ...dna, rules: [...dna.rules, { ...r, status: "active" }], suggestions: dna.suggestions.filter((s) => s.id !== r.id) },
          async () => { await acceptSuggestion(r.id); toast.success("Rule added. Aura will follow it from your next draft."); },
        )}
        onDismiss={(r) => void mutate(
          { ...dna, suggestions: dna.suggestions.filter((s) => s.id !== r.id) },
          async () => { await dismissSuggestion(r.id); toast("Dismissed. Aura will not suggest that again."); },
        )}
        onLookForPatterns={(sources) => void mutate(dna, async () => {
          const res = await runSuggestRules(sources);
          const sourceSummary = Object.entries(res.by_source ?? {})
            .filter(([, count]) => count > 0)
            .map(([source, count]) => `${source}: ${count}`)
            .join(" · ");
          toast.success(res.written > 0
            ? `Aura found ${res.written} ${res.written === 1 ? "pattern" : "patterns"}${sourceSummary ? ` — ${sourceSummary}` : ""}.`
            : "Nothing new — Aura found no pattern it could evidence.");
        })}
        onAdd={(kind, text) => {
          if (!userId) return;
          const rank = dna.rules.filter((r) => r.kind === kind).length;
          const optimistic: DnaRule = {
            id: `pending-${crypto.randomUUID()}`,
            kind,
            text,
            source: "user",
            status: "active",
            rank,
            times_applied: 0,
          };
          void mutate({ ...dna, rules: [...dna.rules, optimistic] }, () => addRule(userId, dna.activeProfileId, kind, text, rank));
        }}
        onEdit={(id, text) => void mutate(
          { ...dna, rules: dna.rules.map((r) => (r.id === id ? { ...r, text } : r)) },
          () => updateRuleText(id, text),
        )}
        onKindChange={(id, kind) => void mutate(
          { ...dna, rules: dna.rules.map((r) => (r.id === id ? { ...r, kind } : r)) },
          () => updateRuleKind(id, kind),
        )}
        onDelete={(id) => void mutate({ ...dna, rules: dna.rules.filter((r) => r.id !== id) }, () => deleteRule(id))}
        onReorder={(ordered: DnaRule[]) => void mutate(
          { ...dna, rules: [...ordered.map((r, i) => ({ ...r, rank: i })), ...dna.rules.filter((r) => !ordered.some((o) => o.id === r.id))] },
          () => reorderRules(userId as string, dna.activeProfileId, ordered),
        )}
      />

      {/* 6 — variation, the only copy in the product */}
      <VariationEngine model={dna} busy={busy} onMutate={(run) => void mutate(dna, run)} />

      {/* 7 — what worked: the voice measured against its own results */}
      <WhatWorked
        userId={userId}
        traits={dna.traits}
        onConfirm={(t) => {
          if (!t.id) return;
          void mutate(
            patchTrait(dna, t.trait_key, { last_confirmed_at: new Date().toISOString() }),
            () => confirmTrait(t.id as string),
          );
        }}
        onReject={(t) => {
          if (!userId || !dna.activeProfileId) return;
          void mutate(
            patchTrait(dna, t.trait_key, { value: null, source: null, confidence: null, id: null }),
            () => rejectTrait(userId, dna.activeProfileId as string, t),
          );
        }}
      />
    </div>
  );
}
