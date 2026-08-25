/**
 * Voice & Writing — the member's voice profile.
 *
 * Presentation and interaction only: every value here reads and writes fields
 * that already exist on `authority_voice_profiles`. Nothing about how the
 * voice is trained or extracted changes in this file.
 *
 * Chrome is English. Arabic appears only inside data values and inside the
 * generated sample post.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, RotateCcw, X, Plus, RefreshCw, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  TONE_OPTIONS, RHYTHM_OPTIONS, EMOJI_OPTIONS, LANGUAGE_OPTIONS, STRUCTURE_OPTIONS,
  OPENER_OPTIONS, CLOSER_OPTIONS, OPENER_LIBRARY, CLOSER_LIBRARY, MOVES_LIBRARY,
  closerKeysFromLabels, closerLabelsFromKeys,
  optionLabel, optionExample, type VoiceOption,
} from "@/components/voice/voiceOptions";
import { composeSample, GENERIC_SAMPLE, type VoiceSpec } from "@/lib/voiceSample";
import LinkedInImportCard from "@/components/LinkedInImportCard";
import VoiceMicBadge from "@/components/voice/VoiceMicBadge";

/* ── System-B tokens ─────────────────────────────────────────────────────── */
const NIGHT = "#0F1519";
const NIGHT_2 = "#1A232A";
const CYAN = "#00CEC9";
const BLUE = "#0670C4";
const BLUE_DARK = "#04477C";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";
const MUTED_NIGHT = "#8A97A6";
const INK = "#0F1519";
const HOVER = "#F2F5F9";
const GREEN = "#12805C";
const RED = "#C0392B";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const EASE = "cubic-bezier(.22,1,.36,1)";

const sectionHeader: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase",
  color: MUTED, marginBlockEnd: 8,
};
const cardStyle: React.CSSProperties = {
  background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 20, overflow: "hidden",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: MUTED,
};
const monoNum: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
};

interface Dimension {
  key: string;
  label: string;
  value: string;
  learned: boolean;
  /** 0–100 — how much of this dimension the profile actually holds. */
  strength: number;
}

/* ── Strength bar: mic badge + one equaliser bar per voice dimension ─────── */
function StrengthBar({
  dims, postCount, updatedAt, reduced,
}: { dims: Dimension[]; postCount: number; updatedAt: string | null; reduced: boolean }) {
  const learned = dims.filter((d) => d.learned).length;
  const complete = learned === dims.length && dims.length > 0;
  const date = updatedAt && !Number.isNaN(new Date(updatedAt).getTime())
    ? new Date(updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()
    : "—";

  return (
    <div style={{
      background: NIGHT, borderRadius: 20, padding: "20px 24px", display: "flex",
      gap: 20, alignItems: "center", flexWrap: "wrap",
    }}>
      <VoiceMicBadge size={52} />

      <div style={{ flex: 1, minInlineSize: 220 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: MUTED_NIGHT,
          }}>Voice strength</span>
          <span style={{ fontSize: 12, color: "#C7D2DC" }}>
            <span style={monoNum}>{learned}</span> of <span style={monoNum}>{dims.length}</span> dimensions learned
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, blockSize: 44, alignItems: "flex-end", marginBlockStart: 12 }}>
          {dims.map((d) => (
            <div
              key={d.key}
              title={`${d.label}${d.learned ? " · learned" : " — not learned yet"}`}
              style={{
                flex: 1, borderRadius: 3,
                blockSize: d.learned ? `${Math.max(18, Math.min(100, d.strength))}%` : "22%",
                background: d.learned ? "linear-gradient(180deg,#00CEC9,rgba(0,206,201,.45))" : "#242E36",
                border: d.learned ? "none" : "1px dashed #3A464F",
                transition: reduced ? "none" : `block-size .5s ${EASE}`,
              }}
            />
          ))}
        </div>

        <div style={{ ...monoNum, fontSize: 11, color: "#6F7C89", marginBlockStart: 10 }}>
          LEARNED FROM {postCount} POSTS · UPDATED {date}{" "}
          <span style={{ color: CYAN }}>
            {complete ? "Voice complete · refine anytime →" : "Teach 3 more →"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── One editable row ────────────────────────────────────────────────────── */
function VoiceRow({
  label, value, open, onToggle, onReset, children, dragProps, onRemove,
}: {
  label: string; value: string; open: boolean; onToggle: () => void; onReset?: () => void;
  children?: React.ReactNode; dragProps?: React.HTMLAttributes<HTMLDivElement>; onRemove?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderBlockStart: `1px solid ${LINE}` }}>
      <div
        {...dragProps}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10, minBlockSize: 46, padding: "10px 14px",
          background: hover || open ? HOVER : "transparent", cursor: "pointer",
        }}
      >
        <span aria-hidden style={{ color: "#C6D0DC", cursor: "grab", fontSize: 13 }}>⠿</span>
        <span style={{ ...labelStyle, inlineSize: 118, flex: "0 0 auto" }} className="voice-row-label">{label}</span>
        <span
          dir="auto"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          style={{
            flex: 1, fontSize: 14.5, lineHeight: 1.5, color: INK, minInlineSize: 0,
            display: "-webkit-box", WebkitBoxOrient: "vertical",
            WebkitLineClamp: expanded ? "unset" : 2, overflow: expanded ? "visible" : "hidden",
            overflowWrap: "anywhere",
          } as React.CSSProperties}
        >
          {value || <span style={{ color: "#8FA1AD" }}>Not set</span>}
        </span>
        <span style={{ display: "flex", gap: 6, opacity: hover || open ? 1 : 0, transition: "opacity .18s" }}>
          <button type="button" aria-label={`Edit ${label}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={iconBtn}><Pencil size={13} /></button>
          {onReset && (
            <button type="button" aria-label={`Reset ${label}`} onClick={(e) => { e.stopPropagation(); onReset(); }}
              style={iconBtn}><RotateCcw size={13} /></button>
          )}
          {onRemove && (
            <button type="button" aria-label={`Remove ${label}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}
              style={iconBtn}><X size={13} /></button>
          )}
        </span>
      </div>
      {open && children ? (
        <div style={{ background: HOVER, borderBlockStart: `1px dashed ${LINE}`, padding: 14 }}>{children}</div>
      ) : null}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  inlineSize: 26, blockSize: 26, borderRadius: 8, border: `1px solid ${LINE}`, background: "#FFFFFF",
  color: MUTED, display: "grid", placeItems: "center", cursor: "pointer",
};

/* ── Chip picker with a worked example ───────────────────────────────────── */
function ChipEditor({
  options, selected, onSelect,
}: { options: VoiceOption[]; selected: string; onSelect: (id: string) => void }) {
  const [preview, setPreview] = useState(selected || options[0]?.id || "");
  useEffect(() => { if (selected) setPreview(selected); }, [selected]);
  const example = optionExample(options, preview) || options[0]?.example || "";
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const on = o.id === selected;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => { setPreview(o.id); onSelect(o.id); }}
              onMouseEnter={() => setPreview(o.id)}
              dir="auto"
              style={{
                padding: "7px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
                background: on ? BLUE : "#FFFFFF", color: on ? "#FFFFFF" : INK,
                border: `1px solid ${on ? BLUE : LINE}`,
              }}
              onFocus={() => setPreview(o.id)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <div dir="auto" style={{
        marginBlockStart: 12, background: "#FFFFFF", border: `1px solid ${LINE}`,
        borderInlineStart: `3px solid ${CYAN}`, borderRadius: 10, padding: "10px 12px",
        fontSize: 13.5, lineHeight: 1.6, color: INK,
      }}>
        {example}
      </div>
    </div>
  );
}

/* ── Ordered, editable list with a curated picker ────────────────────────── */
function ListEditor({
  items, library, onChange,
}: { items: string[]; library: string[]; onChange: (next: string[]) => void }) {
  const [picker, setPicker] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = items.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: MUTED, marginBlockEnd: 10 }}>
        Drag to reorder — the top one is used most. Remove what isn't you.
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item, i) => (
          <div
            key={`${item}-${i}`}
            draggable
            onDragStart={() => { dragIndex.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex.current !== null) move(dragIndex.current, i); dragIndex.current = null; }}
            style={{
              display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF",
              border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 10px",
            }}
          >
            <span aria-hidden style={{ color: "#C6D0DC", cursor: "grab" }}>⠿</span>
            <span dir="auto" style={{ flex: 1, fontSize: 13.5, color: INK, overflowWrap: "anywhere" }}>{item}</span>
            <button type="button" aria-label="Remove item" style={iconBtn}
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}><X size={13} /></button>
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 12.5, color: "#8FA1AD" }}>Nothing here yet.</p>}
      </div>

      <button
        type="button"
        onClick={() => setPicker((v) => !v)}
        style={{
          marginBlockStart: 10, inlineSize: "100%", padding: "9px 12px", borderRadius: 10,
          border: `1px dashed ${LINE}`, background: "transparent", color: MUTED, fontSize: 12.5,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        <Plus size={13} /> Add from library
      </button>

      {picker && (
        <div style={{ marginBlockStart: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {library.filter((l) => !items.includes(l)).map((l) => (
            <button key={l} type="button" onClick={() => { onChange([...items, l]); setPicker(false); }}
              style={{
                padding: "7px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
                background: "#FFFFFF", color: INK, border: `1px solid ${LINE}`,
              }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */
const VoiceEngineSection = ({ onWrite }: { onWrite?: () => void } = {}) => {
  const reduced = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [lenDraft, setLenDraft] = useState<number | null>(null);
  const [postCount, setPostCount] = useState(0);

  // Test panel
  const [generic, setGeneric] = useState(false);
  const [seed, setSeed] = useState(0);
  const [aiSample, setAiSample] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [changeNote, setChangeNote] = useState<string | null>(null);

  // Teach Aura
  const [teachText, setTeachText] = useState("");
  const [teaching, setTeaching] = useState(false);
  const teachFileRef = useRef<HTMLInputElement>(null);

  const loadProfiles = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("authority_voice_profiles")
      .select("id, language, is_primary, example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, allowed_endings, updated_at")
      .eq("user_id", session.user.id)
      // This editor edits the member's voice rows, one per language — not modes.
      .eq("mode_key", "default");
    setProfiles(Array.isArray(data) ? data : []);
    const { count } = await supabase
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .not("post_text", "is", null);
    setPostCount(count ?? 0);
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  useEffect(() => {
    if (searchParams.get("focus") !== "voice") return;
    const id = window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }, 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* One voice: the member's primary row. */
  const row: any = useMemo(
    () => profiles.find((r) => r?.is_primary) || profiles[0] || null,
    [profiles],
  );
  const vocab: any = (row?.vocabulary_preferences && typeof row.vocabulary_preferences === "object")
    ? row.vocabulary_preferences : {};
  const prefs: any = (vocab.prefs && typeof vocab.prefs === "object" && !Array.isArray(vocab.prefs)) ? vocab.prefs : {};

  const asText = (v: any): string =>
    typeof v === "string" ? v : String(v?.text ?? v?.content ?? v?.rule ?? v?.phrase ?? "");
  const list = (v: any): string[] => (Array.isArray(v) ? v.map(asText).filter(Boolean) : []);

  const toneId: string = typeof row?.tone === "string" && TONE_OPTIONS.some((o) => o.id === row.tone) ? row.tone : "";
  const rhythmId: string = typeof prefs.rhythm === "string" ? prefs.rhythm : "";
  const emojiId: string = ["none", "rare", "some"].includes(prefs.emoji_level) ? prefs.emoji_level : "";
  const languageId: string = ["en", "ar", "mixed"].includes(prefs.language_mode)
    ? prefs.language_mode : (row?.language === "ar" ? "ar" : row?.language === "en" ? "en" : "");
  const structureId: string = typeof prefs.structure === "string" ? prefs.structure : "";
  const openerId: string = typeof prefs.opener === "string" ? prefs.opener : "";
  const closerId: string = typeof prefs.closer === "string" ? prefs.closer : "";
  const lengthSet = Number.isFinite(Number(prefs.length_max)) && Number(prefs.length_max) > 0;
  const lengthVal = lengthSet ? Number(prefs.length_max) : 1400;
  const openerBank = list(prefs.openings);
  // The column stores controlled ending keys; this screen speaks labels.
  const closerBank = closerLabelsFromKeys(list(row?.allowed_endings));
  const moves = list(row?.storytelling_patterns);
  const alwaysRules = list(vocab.use);
  const neverRules = list(vocab.avoid);
  const anchors = Array.isArray(row?.example_posts) ? row.example_posts : [];

  const dims: Dimension[] = useMemo(() => {
    const scalar = (key: string, label: string, id: string, opts: VoiceOption[]) => ({
      key, label, value: optionLabel(opts, id) || (id ? String(id) : ""), learned: !!id, strength: id ? 100 : 0,
    });
    const listDim = (key: string, label: string, arr: string[], target: number) => ({
      key, label, value: arr.join(" · "), learned: arr.length > 0,
      strength: Math.min(100, Math.round((arr.length / target) * 100)),
    });
    return [
      scalar("tone", "Tone", toneId, TONE_OPTIONS),
      { key: "length", label: "Length", value: lengthSet ? `${lengthVal.toLocaleString()} characters` : "", learned: lengthSet, strength: lengthSet ? 100 : 0 },
      scalar("rhythm", "Rhythm", rhythmId, RHYTHM_OPTIONS),
      scalar("emoji", "Emoji", emojiId, EMOJI_OPTIONS),
      scalar("language", "Language", languageId, LANGUAGE_OPTIONS),
      scalar("structure", "Structure", structureId, STRUCTURE_OPTIONS),
      scalar("opener", "Opener", openerId, OPENER_OPTIONS),
      scalar("closer", "Closer", closerId, CLOSER_OPTIONS),
      listDim("opener_bank", "Opener bank", openerBank, 4),
      listDim("closer_bank", "Closer bank", closerBank, 4),
      listDim("moves", "Signature moves", moves, 5),
      { key: "rules", label: "Rules", value: `${alwaysRules.length} always · ${neverRules.length} never`, learned: alwaysRules.length + neverRules.length > 0, strength: Math.min(100, Math.round(((alwaysRules.length + neverRules.length) / 10) * 100)) },
      { key: "anchors", label: "Voice anchors", value: `${anchors.length} posts`, learned: anchors.length > 0, strength: Math.min(100, Math.round((anchors.length / 10) * 100)) },
    ];
  }, [toneId, lengthSet, lengthVal, rhythmId, emojiId, languageId, structureId, openerId, closerId,
      openerBank, closerBank, moves, alwaysRules, neverRules, anchors]);

  /* ── Persistence: optimistic, rolled back on failure ───────────────────── */
  const patchLocal = (patch: Record<string, any>) => {
    setProfiles((rows) => {
      if (rows.length === 0) return [{ language: "en", is_primary: true, ...patch }];
      const idx = rows.findIndex((r) => (row?.id ? r.id === row.id : true));
      const copy = rows.slice();
      copy[Math.max(0, idx)] = { ...copy[Math.max(0, idx)], ...patch };
      return copy;
    });
  };

  const write = async (patch: Record<string, any>, prev: Record<string, any>, note?: string) => {
    patchLocal(patch);
    if (note) setChangeNote(note);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const stamped = { ...patch, updated_at: new Date().toISOString() };
      if (row?.id) {
        const { error } = await supabase.from("authority_voice_profiles")
          .update(stamped).eq("id", row.id).eq("user_id", session.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("authority_voice_profiles")
          .insert({ user_id: session.user.id, language: "en", mode_key: "default", is_primary: true, ...stamped } as any);
        if (error) throw error;
        await loadProfiles();
        return;
      }
      patchLocal({ updated_at: stamped.updated_at });
    } catch (e: any) {
      patchLocal(prev);
      toast.error(e?.message || "Couldn't save that change");
    }
  };

  const writePrefs = (next: Record<string, any>, note: string) =>
    write(
      { vocabulary_preferences: { ...vocab, prefs: { ...prefs, ...next } } },
      { vocabulary_preferences: vocab },
      note,
    );

  const resetPref = (key: string, label: string) => {
    const nextPrefs = { ...prefs };
    delete nextPrefs[key];
    write(
      { vocabulary_preferences: { ...vocab, prefs: nextPrefs } },
      { vocabulary_preferences: vocab },
      `Changed: ${label} → not set — sample rewritten below.`,
    );
  };

  /* ── Teach Aura ────────────────────────────────────────────────────────── */
  const parsePostsBlock = (text: string): string[] =>
    text.split(/\n\s*-{3,}\s*\n|\n{2,}/).map((s) => s.trim()).filter(Boolean);

  const teachFromPosts = async (posts: string[]) => {
    if (posts.length === 0) { toast.error("Add at least one post to teach Aura from."); return; }
    setTeaching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("voice-distill", {
        body: { posts, store_samples: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Voice sharpened from ${posts.length} ${posts.length === 1 ? "post" : "posts"}.`);
      setTeachText("");
      await loadProfiles();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't teach Aura from those posts");
    } finally {
      setTeaching(false);
    }
  };

  const handleTeachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    try {
      const text = await file.text();
      await teachFromPosts(parsePostsBlock(text));
    } catch {
      toast.error("Couldn't read that file. Use a .txt or .md export.");
    } finally {
      if (teachFileRef.current) teachFileRef.current.value = "";
    }
  };

  /* ── Sample ────────────────────────────────────────────────────────────── */
  const spec: VoiceSpec = {
    language: (languageId || "en") as VoiceSpec["language"],
    tone: toneId || "blunt_practitioner",
    rhythm: rhythmId || "balanced",
    emoji: emojiId || "none",
    opener: openerId || "claim",
    closer: closerId || "question",
    structure: structureId || "tension_insight",
    length: lengthVal,
  };
  const composed = useMemo(() => composeSample(spec, seed), [
    spec.language, spec.tone, spec.rhythm, spec.emoji, spec.opener, spec.closer, spec.structure, spec.length, seed,
  ]);
  const sampleText = generic ? GENERIC_SAMPLE : (aiSample ?? composed.text);
  const sampleIsAr = !generic && spec.language === "ar";

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-sample", {
        body: {
          voice: {
            language: spec.language === "ar" ? "ar" : "en",
            tone: optionLabel(TONE_OPTIONS, spec.tone),
            rhythm: optionLabel(RHYTHM_OPTIONS, spec.rhythm),
            emoji: optionLabel(EMOJI_OPTIONS, spec.emoji),
            opener: optionLabel(OPENER_OPTIONS, spec.opener),
            closer: optionLabel(CLOSER_OPTIONS, spec.closer),
            structure: optionLabel(STRUCTURE_OPTIONS, spec.structure),
            length: spec.length,
            moves: moves.join("; "),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.sample) { setAiSample(String(data.sample)); setSeed((s) => s + 1); }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't generate another sample");
    } finally {
      setRegenerating(false);
    }
  };

  const setPrefAndNote = (key: string, value: any, label: string, options: VoiceOption[]) => {
    setAiSample(null);
    writePrefs({ [key]: value }, `Changed: ${label} → ${optionLabel(options, value) || value} — sample rewritten below.`);
  };

  const lengthConsequence = (n: number) =>
    n < 1000 ? "Tight. One idea, no proof stack. Fits above the fold."
      : n <= 1700 ? "One idea plus two proofs. Reader clicks see-more once."
        : "Full argument with a proof stack. Needs a strong hook to earn the expand.";

  const toggle = (key: string) => setOpenRow((cur) => (cur === key ? null : key));

  const highlight = (text: string) => {
    if (generic) return text;
    const parts: React.ReactNode[] = [];
    const mark = (s: string, k: string) => (
      <mark key={k} style={{ background: "rgba(0,206,201,.16)", color: "inherit", borderRadius: 3, padding: "0 2px" }}>{s}</mark>
    );
    let rest = text;
    if (composed.hook && rest.startsWith(composed.hook)) {
      parts.push(mark(composed.hook, "hook"));
      rest = rest.slice(composed.hook.length);
    }
    if (composed.closer && rest.endsWith(composed.closer)) {
      parts.push(rest.slice(0, rest.length - composed.closer.length));
      parts.push(mark(composed.closer, "closer"));
    } else {
      parts.push(rest);
    }
    return parts;
  };

  return (
    <div ref={containerRef} dir="ltr" style={{ fontFamily: "Inter, system-ui, sans-serif", color: INK }}>
      <style>{`
        @keyframes voiceLiveDot { 0%,100% { opacity: 1 } 50% { opacity: .2 } }
        .voice-live-dot { animation: voiceLiveDot 1.4s infinite ease-in-out; }
        .voice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
        .voice-rules { display: grid; grid-template-columns: 1fr 1fr 1fr; }
        .voice-rules > div + div { border-inline-start: 1px solid ${LINE}; }
        @media (max-width: 820px) {
          .voice-grid { grid-template-columns: 1fr; }
          .voice-rules { grid-template-columns: 1fr; }
          .voice-rules > div + div { border-inline-start: none; border-block-start: 1px solid ${LINE}; }
          .voice-row-label { inline-size: 100px !important; }
          .voice-test-desktop { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .voice-live-dot { animation: none !important; }
        }
      `}</style>

      <StrengthBar dims={dims} postCount={postCount} updatedAt={row?.updated_at ?? null} reduced={reduced} />

      <div className="voice-grid" style={{ marginBlockStart: 20 }}>
        {/* Signature */}
        <section>
          <h3 style={sectionHeader}>Signature</h3>
          <div style={cardStyle}>
            <VoiceRow label="Tone" value={optionLabel(TONE_OPTIONS, toneId)} open={openRow === "tone"}
              onToggle={() => toggle("tone")}
              onReset={() => write({ tone: null }, { tone: row?.tone ?? null }, "Changed: Tone → not set — sample rewritten below.")}>
              <ChipEditor options={TONE_OPTIONS} selected={toneId} onSelect={(id) => {
                setAiSample(null);
                write({ tone: id }, { tone: row?.tone ?? null }, `Changed: Tone → ${optionLabel(TONE_OPTIONS, id)} — sample rewritten below.`);
              }} />
            </VoiceRow>

            <VoiceRow label="Length" value={lengthSet ? `${lengthVal.toLocaleString()} characters` : ""}
              open={openRow === "length"} onToggle={() => toggle("length")}
              onReset={() => resetPref("length_max", "Length")}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={labelStyle}>Target length</span>
                  <span style={{ ...monoNum, fontSize: 14 }}>{(lenDraft ?? lengthVal).toLocaleString()}</span>
                </div>
                <input
                  type="range" min={600} max={2600} step={100}
                  value={lenDraft ?? lengthVal}
                  onChange={(e) => setLenDraft(Number(e.target.value))}
                  onMouseUp={() => { if (lenDraft !== null) { setAiSample(null); writePrefs({ length_max: lenDraft }, `Changed: Length → ${lenDraft.toLocaleString()} characters — sample rewritten below.`); } }}
                  onTouchEnd={() => { if (lenDraft !== null) { setAiSample(null); writePrefs({ length_max: lenDraft }, `Changed: Length → ${lenDraft.toLocaleString()} characters — sample rewritten below.`); } }}
                  style={{ inlineSize: "100%", accentColor: BLUE, marginBlock: 10 }}
                />
                <p style={{ fontSize: 12.5, color: MUTED }}>{lengthConsequence(lenDraft ?? lengthVal)}</p>
              </div>
            </VoiceRow>

            <VoiceRow label="Rhythm" value={optionLabel(RHYTHM_OPTIONS, rhythmId)} open={openRow === "rhythm"}
              onToggle={() => toggle("rhythm")} onReset={() => resetPref("rhythm", "Rhythm")}>
              <ChipEditor options={RHYTHM_OPTIONS} selected={rhythmId}
                onSelect={(id) => setPrefAndNote("rhythm", id, "Rhythm", RHYTHM_OPTIONS)} />
            </VoiceRow>

            <VoiceRow label="Emoji" value={optionLabel(EMOJI_OPTIONS, emojiId)} open={openRow === "emoji"}
              onToggle={() => toggle("emoji")} onReset={() => resetPref("emoji_level", "Emoji")}>
              <ChipEditor options={EMOJI_OPTIONS} selected={emojiId}
                onSelect={(id) => setPrefAndNote("emoji_level", id, "Emoji", EMOJI_OPTIONS)} />
            </VoiceRow>

            <VoiceRow label="Language" value={optionLabel(LANGUAGE_OPTIONS, languageId)} open={openRow === "language"}
              onToggle={() => toggle("language")} onReset={() => resetPref("language_mode", "Language")}>
              <ChipEditor options={LANGUAGE_OPTIONS} selected={languageId}
                onSelect={(id) => setPrefAndNote("language_mode", id, "Language", LANGUAGE_OPTIONS)} />
            </VoiceRow>
          </div>
        </section>

        {/* How you build a post + Rules */}
        <div style={{ display: "grid", gap: 18 }}>
          <section>
            <h3 style={sectionHeader}>How you build a post</h3>
            <div style={cardStyle}>
              <VoiceRow label="Structure" value={optionLabel(STRUCTURE_OPTIONS, structureId)} open={openRow === "structure"}
                onToggle={() => toggle("structure")} onReset={() => resetPref("structure", "Structure")}>
                <ChipEditor options={STRUCTURE_OPTIONS} selected={structureId}
                  onSelect={(id) => setPrefAndNote("structure", id, "Structure", STRUCTURE_OPTIONS)} />
              </VoiceRow>

              <VoiceRow label="Opener" value={optionLabel(OPENER_OPTIONS, openerId)} open={openRow === "opener"}
                onToggle={() => toggle("opener")} onReset={() => resetPref("opener", "Opener")}>
                <ChipEditor options={OPENER_OPTIONS} selected={openerId}
                  onSelect={(id) => setPrefAndNote("opener", id, "Opener", OPENER_OPTIONS)} />
              </VoiceRow>

              <VoiceRow label="Closer" value={optionLabel(CLOSER_OPTIONS, closerId)} open={openRow === "closer"}
                onToggle={() => toggle("closer")} onReset={() => resetPref("closer", "Closer")}>
                <ChipEditor options={CLOSER_OPTIONS} selected={closerId}
                  onSelect={(id) => setPrefAndNote("closer", id, "Closer", CLOSER_OPTIONS)} />
              </VoiceRow>

              <VoiceRow label="Opener bank" value={openerBank.join(" · ")} open={openRow === "opener_bank"}
                onToggle={() => toggle("opener_bank")}
                onReset={() => resetPref("openings", "Opener bank")}>
                <ListEditor items={openerBank} library={OPENER_LIBRARY}
                  onChange={(next) => writePrefs({ openings: next }, "Changed: Opener bank order — sample rewritten below.")} />
              </VoiceRow>

              <VoiceRow label="Closer bank" value={closerBank.join(" · ")} open={openRow === "closer_bank"}
                onToggle={() => toggle("closer_bank")}
                onReset={() => write({ allowed_endings: [] }, { allowed_endings: row?.allowed_endings ?? [] }, "Changed: Closer bank → cleared — sample rewritten below.")}>
                <ListEditor items={closerBank} library={CLOSER_LIBRARY}
                  onChange={(next) => write({ allowed_endings: closerKeysFromLabels(next) }, { allowed_endings: row?.allowed_endings ?? [] }, "Changed: Closer bank order — sample rewritten below.")} />
              </VoiceRow>

              <VoiceRow label="Signature moves" value={moves.join(" · ")} open={openRow === "moves"}
                onToggle={() => toggle("moves")}
                onReset={() => write({ storytelling_patterns: [] }, { storytelling_patterns: row?.storytelling_patterns ?? [] }, "Changed: Signature moves → cleared — sample rewritten below.")}>
                <ListEditor items={moves} library={MOVES_LIBRARY}
                  onChange={(next) => write({ storytelling_patterns: next }, { storytelling_patterns: row?.storytelling_patterns ?? [] }, "Changed: Signature moves order — sample rewritten below.")} />
              </VoiceRow>
            </div>
          </section>

          <section>
            <h3 style={sectionHeader}>Rules</h3>
            <div style={cardStyle}>
              <div className="voice-rules">
                {[
                  { n: alwaysRules.length, label: "Always", color: GREEN },
                  { n: neverRules.length, label: "Never", color: RED },
                  { n: anchors.length, label: "Voice anchors", color: BLUE },
                ].map((c) => (
                  <div key={c.label} style={{ padding: "18px 16px", textAlign: "center" }}>
                    <div style={{ ...monoNum, fontSize: 25, fontWeight: 500, color: c.color }}>{c.n}</div>
                    <div style={{ ...labelStyle, marginBlockStart: 4 }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 style={sectionHeader}>Teach Aura</h3>
            <div style={{ marginBlockEnd: 12 }}>
              <LinkedInImportCard onImported={() => loadProfiles()} />
            </div>
            <div style={{ ...cardStyle, padding: 14 }}>
              <p style={{ fontSize: 12.5, color: MUTED, marginBlockEnd: 10 }}>
                Paste posts you have written — one per block, separated by a blank line. Aura learns the style, never the words.
              </p>
              <textarea
                dir="auto"
                value={teachText}
                onChange={(e) => setTeachText(e.target.value)}
                rows={4}
                placeholder="Paste one or more of your posts…"
                style={{
                  inlineSize: "100%", border: `1px solid ${LINE}`, borderRadius: 12, padding: 10,
                  fontSize: 13.5, lineHeight: 1.6, color: INK, background: "#FFFFFF", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginBlockStart: 10, flexWrap: "wrap" }}>
                <button type="button" disabled={teaching} onClick={() => teachFromPosts(parsePostsBlock(teachText))}
                  style={{
                    padding: "9px 14px", borderRadius: 10, border: `1px solid ${LINE}`, background: "#FFFFFF",
                    color: INK, fontSize: 12.5, cursor: teaching ? "default" : "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                  {teaching ? <Loader2 size={13} className="animate-spin" /> : null} Teach Aura
                </button>
                <button type="button" onClick={() => teachFileRef.current?.click()}
                  style={{
                    padding: "9px 14px", borderRadius: 10, border: `1px dashed ${LINE}`, background: "transparent",
                    color: MUTED, fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}>
                  <Upload size={13} /> Upload a file
                </button>
                <input ref={teachFileRef} type="file" accept=".txt,.md" hidden onChange={handleTeachFile} />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Test your voice — result renders BELOW the inputs, always. */}
      <div style={{ position: "sticky", insetBlockEnd: 12, marginBlockStart: 22, zIndex: 5 }}>
        <div style={{
          background: NIGHT, borderRadius: 24, padding: 18,
          boxShadow: "0 16px 40px rgba(15,21,25,.26)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: MUTED_NIGHT }}>
              Test your voice
            </span>
            <span className="voice-live-dot" aria-hidden style={{ inlineSize: 7, blockSize: 7, borderRadius: "50%", background: CYAN }} />
            <span style={{ fontSize: 11.5, color: MUTED_NIGHT }}>Live</span>
            <div style={{ marginInlineStart: "auto", background: NIGHT_2, borderRadius: 999, padding: 3, display: "flex", gap: 3 }}>
              {[{ id: "voice", label: "With your voice" }, { id: "generic", label: "Generic AI" }].map((t) => {
                const on = (t.id === "generic") === generic;
                return (
                  <button key={t.id} type="button" onClick={() => setGeneric(t.id === "generic")}
                    style={{
                      padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12,
                      background: on ? "#26333C" : "transparent", color: on ? "#E8EDF2" : MUTED_NIGHT,
                    }}>{t.label}</button>
                );
              })}
            </div>
          </div>

          <div
            dir={sampleIsAr ? "rtl" : "ltr"}
            style={{
              marginBlockStart: 12, color: "#E8EDF2", fontSize: 14.5,
              lineHeight: sampleIsAr ? 1.9 : 1.75, whiteSpace: "pre-wrap",
              fontFamily: sampleIsAr ? "'CairoAR', 'Cairo', Inter, sans-serif" : "Inter, system-ui, sans-serif",
              maxBlockSize: 230, overflowY: "auto",
              transition: reduced ? "none" : `opacity .3s ${EASE}`,
            }}
          >
            {aiSample && !generic ? aiSample : highlight(sampleText)}
          </div>

          <p style={{ fontSize: 12, color: MUTED_NIGHT, marginBlockStart: 10 }}>
            {changeNote ?? "Change any value above to see what moves."}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBlockStart: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={regenerate} disabled={regenerating}
              style={{
                padding: "9px 14px", borderRadius: 10, border: "1px solid #2E3A44", background: "transparent",
                color: "#C7D2DC", fontSize: 12.5, cursor: regenerating ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Another sample
            </button>
            <span className="voice-test-desktop" style={{ ...monoNum, fontSize: 11, color: "#6F7C89" }}>
              {generic
                ? `GENERIC · ${GENERIC_SAMPLE.length} CHARS`
                : `${(languageId === "ar" ? "ARABIC" : languageId === "mixed" ? "MIXED" : "ENGLISH")} · ${sampleText.length} CHARS · TARGET ${lengthVal.toLocaleString()}`}
            </span>
            <button
              type="button"
              onClick={() => onWrite?.()}
              style={{
                marginInlineStart: "auto", padding: "11px 18px", borderRadius: 12, border: "none",
                background: BLUE, color: "#FFFFFF", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BLUE_DARK; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BLUE; }}
            >
              Write in this voice →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceEngineSection;
