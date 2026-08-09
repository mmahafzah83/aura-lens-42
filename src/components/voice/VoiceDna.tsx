/**
 * Voice DNA — what Aura believes about how you write, and the controls to
 * correct it.
 *
 * The page owns no arithmetic. Everything it renders arrives from
 * `loadVoiceDna`, which reads the three shared database functions. Writes are
 * optimistic with rollback so a failed save never leaves a wrong number on
 * screen pretending to be saved.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SpectrumRow from "@/components/voice/SpectrumRow";
import VoiceModes from "@/components/voice/VoiceModes";
import VoiceRules from "@/components/voice/VoiceRules";
import VariationEngine from "@/components/voice/VariationEngine";
import { BLUE, INK, LINE, MUTED, cardStyle, microLabel } from "@/components/voice/tokens";
import {
  MODE_DEFS, addRule, confirmTrait, createMode, deleteRule, loadVoiceDna, rejectTrait,
  reorderRules, restoreLearned, setTraitLock, setTraitValue, updateRuleText,
  type DnaRule, type DnaTrait, type VoiceDnaModel,
} from "@/lib/voiceDna";

const GROUP_LABEL: Record<string, string> = { sound: "How you sound", structure: "How you build a post", language: "Language" };

export default function VoiceDna({
  userId,
  onWrite,
  onNavigate,
  modelOverride,
}: {
  userId: string | null;
  onWrite?: () => void;
  onNavigate?: (tab: "dna" | "teach" | "test") => void;
  /** Harness only. */
  modelOverride?: VoiceDnaModel;
}) {
  const [model, setModel] = useState<VoiceDnaModel | null>(modelOverride ?? null);
  const [loading, setLoading] = useState(!modelOverride);
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (modelOverride) { setModel(modelOverride); setLoading(false); return; }
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      setModel(await loadVoiceDna(userId, profileId));
    } catch (e) {
      console.error("[VoiceDna] load failed", e);
      toast.error("Couldn't load your voice DNA.");
    } finally {
      setLoading(false);
    }
  }, [userId, profileId, modelOverride]);

  useEffect(() => { void load(); }, [load]);

  /** Optimistic write with rollback — the screen never shows an unsaved value. */
  const mutate = useCallback(async (next: VoiceDnaModel, run: () => Promise<void>) => {
    if (!model) return;
    const prev = model;
    setModel(next);
    setBusy(true);
    try {
      await run();
      await load();
    } catch (e) {
      console.error("[VoiceDna] save failed", e);
      setModel(prev);
      toast.error("Couldn't save that. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }, [model, load]);

  const patchTrait = (m: VoiceDnaModel, key: string, patch: Partial<DnaTrait>): VoiceDnaModel => ({
    ...m, traits: m.traits.map((t) => (t.trait_key === key ? { ...t, ...patch } : t)),
  });

  const grouped = useMemo(() => {
    const out = new Map<string, DnaTrait[]>();
    for (const t of model?.traits ?? []) {
      const list = out.get(t.group_key) ?? [];
      list.push(t);
      out.set(t.group_key, list);
    }
    return [...out.entries()];
  }, [model]);

  if (loading) return <div style={{ fontSize: 13, color: MUTED, padding: "24px 0" }}>Reading your voice…</div>;
  if (!model) return <div style={{ fontSize: 13, color: MUTED, padding: "24px 0" }}>Sign in to see your voice DNA.</div>;

  const styles = (
    <style>{`
      .vd-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .vd-rules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .vd-act { display: inline-flex; align-items: center; gap: 4px; background: #FFFFFF; color: ${MUTED};
        border: 1px solid ${LINE}; border-radius: 8px; padding: 4px 9px; font-size: 11.5px; font-weight: 600; cursor: pointer; }
      .vd-act:disabled { opacity: .45; cursor: not-allowed; }
      .vd-actions { opacity: 1; }
      @media (hover: hover) and (min-width: 768px) {
        .vd-actions { opacity: 0; transition: opacity .12s ease; }
        .vd-row:hover .vd-actions, .vd-row:focus-within .vd-actions { opacity: 1; }
      }
      @media (max-width: 860px) {
        .vd-modes, .vd-rules { grid-template-columns: 1fr; }
      }
    `}</style>
  );

  // Nothing measured and no profile: one card, and nothing invented around it.
  if (!model.hasProfile) {
    return (
      <div dir="ltr" style={{ fontFamily: "Inter, system-ui, sans-serif", color: INK }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aura hasn't read anything you've written yet.</div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 6 }}>
            There is no voice to show until Aura has some of your writing to read.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.("teach")}
            style={{
              background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10,
              padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Teach Aura
          </button>
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" style={{ fontFamily: "Inter, system-ui, sans-serif", color: INK }}>
      {styles}

      {onWrite && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: 12 }}>
          <button
            type="button"
            onClick={onWrite}
            style={{
              background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10,
              padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Write with this voice
          </button>
        </div>
      )}

      {/* 1 — spectrums */}
      <p style={{ fontSize: 12.5, color: MUTED, marginBlockStart: 0, marginBlockEnd: 8 }}>
        Drag any marker to correct it. Aura keeps learning the ones you leave alone.
      </p>
      <div style={cardStyle}>
        {grouped.map(([group, traits]) => (
          <div key={group} style={{ marginBlockEnd: 8 }}>
            <div style={microLabel}>{GROUP_LABEL[group] ?? group}</div>
            {traits.map((t) => (
              <SpectrumRow
                key={t.trait_key}
                trait={t}
                busy={busy}
                onSet={(v) => {
                  if (!userId || !model.activeProfileId) return;
                  void mutate(
                    patchTrait(model, t.trait_key, { value: v, source: "user", confidence: "high", last_confirmed_at: new Date().toISOString() }),
                    () => setTraitValue(userId, model.activeProfileId as string, t, v),
                  );
                }}
                onLock={() => {
                  if (!t.id) return;
                  void mutate(patchTrait(model, t.trait_key, { locked: !t.locked }), () => setTraitLock(t.id as string, !t.locked));
                }}
                onRestore={() => {
                  if (!t.id || t.learned_value === null) return;
                  void mutate(
                    patchTrait(model, t.trait_key, { value: t.learned_value, source: "learned" }),
                    () => restoreLearned(t.id as string, t.learned_value as number),
                  );
                }}
                onConfirm={() => {
                  if (!t.id) return;
                  void mutate(
                    patchTrait(model, t.trait_key, { last_confirmed_at: new Date().toISOString() }),
                    () => confirmTrait(t.id as string),
                  );
                }}
                onReject={() => {
                  if (!userId || !model.activeProfileId) return;
                  void mutate(
                    patchTrait(model, t.trait_key, { value: null, source: null, confidence: null, id: null }),
                    () => rejectTrait(userId, model.activeProfileId as string, t),
                  );
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 2 — modes */}
      <VoiceModes
        modes={model.modes}
        activeProfileId={model.activeProfileId}
        busy={busy}
        onSelect={(id) => setProfileId(id)}
        onCreate={(key) => {
          const def = MODE_DEFS.find((d) => d.key === key);
          if (!def || !userId) return;
          void mutate(model, async () => {
            const { profileId: created, needsEvidence } = await createMode(userId, def, model.traits);
            setProfileId(created);
            toast.success(needsEvidence
              ? `${def.label} created — some shifts were clamped to what your posts prove, so it needs evidence.`
              : `${def.label} created from your measured voice.`);
          });
        }}
      />

      {/* 3 — rules */}
      <VoiceRules
        rules={model.rules}
        busy={busy}
        onAdd={(kind, text) => {
          if (!userId) return;
          const rank = model.rules.filter((r) => r.kind === kind).length;
          void mutate(model, () => addRule(userId, model.activeProfileId, kind, text, rank));
        }}
        onEdit={(id, text) => void mutate(
          { ...model, rules: model.rules.map((r) => (r.id === id ? { ...r, text } : r)) },
          () => updateRuleText(id, text),
        )}
        onDelete={(id) => void mutate(
          { ...model, rules: model.rules.filter((r) => r.id !== id) },
          () => deleteRule(id),
        )}
        onReorder={(ordered: DnaRule[]) => void mutate(
          { ...model, rules: [...ordered.map((r, i) => ({ ...r, rank: i })), ...model.rules.filter((r) => !ordered.some((o) => o.id === r.id))] },
          () => reorderRules(ordered),
        )}
      />

      {/* 4 — variation */}
      <VariationEngine model={model} />
    </div>
  );
}