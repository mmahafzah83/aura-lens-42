/**
 * Step 5 — text only, never layout.
 *
 * The panel lists exactly the slots this slide has filled, under friendly
 * names. Character counters appear only where a real budget exists (hero
 * lines), because that is the one constraint a member cannot otherwise see.
 */
import React, { useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import type { Archetype, DeckIR, Slide, Slots } from "../deckIR";
import { ARCHETYPE_LABEL, SLOT_LABEL, SLOT_ORDER } from "./slotLabels";
import { REQUIRED_SLOTS, OPTIONAL_SLOTS } from "../slots";
import { useMeasuredDrops } from "../render/measuredDrops";
import {
  deleteSlide, editSlotText, heroBudgetFor, isLocked, readSlot,
  setHeroHighlight, setSlidePhoto, slideHasPicture, swapArchetype, swappableArchetypes, type SlotPath,
} from "./deckEdit";
import { wordBudgetFor } from "../slots";

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: ".09em",
  textTransform: "uppercase", color: "var(--text-muted)",
};

const areaStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  padding: "9px 11px",
  fontFamily: "var(--ff-ui)",
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--text-primary)",
  resize: "vertical",
};

function counterColour(len: number, budget: number): string {
  if (len > budget) return "var(--error)";
  if (len > budget - 3) return "var(--deadline-text)";
  return "var(--text-muted)";
}

function Field({
  label, value, rows, budget, count, onChange, right,
}: {
  label: string;
  value: string;
  rows?: number;
  budget?: number;
  /** What the counter measures — characters for hero lines, words elsewhere. */
  count?: number;
  onChange: (v: string) => void;
  right?: React.ReactNode;
}) {
  const n = count ?? value.length;
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {budget !== undefined && (
            <span style={{ ...labelStyle, color: counterColour(n, budget) }}>
              {n}/{budget}
            </span>
          )}
          {right}
        </span>
      </div>
      <textarea
        value={value}
        rows={rows ?? 2}
        onChange={(e) => onChange(e.target.value)}
        style={areaStyle}
      />
    </div>
  );
}

export function EditPanel({
  deck, slide, onChange, onRewrite, rewriting, onUploadPhoto, mediaError, mediaSupport,
}: {
  deck: DeckIR;
  slide: Slide;
  onChange: (next: DeckIR) => void;
  onRewrite: () => void;
  rewriting: boolean;
  onUploadPhoto: (file: File) => Promise<void>;
  /** Anything that went wrong on this control, shown right here. */
  mediaError?: string | null;
  /** Whether this archetype can show a photo at all, and how. */
  mediaSupport?: "cover" | "band" | "none";
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const locked = isLocked(deck, slide);
  const swaps = swappableArchetypes(deck, slide);
  const canHoldPhoto = mediaSupport !== "none";
  /**
   * WHAT THE PHOTO COST. The band variant gives up whole written slots when
   * measurement proves they cannot be drawn. That is a real loss of the
   * member's words, so it is named here, next to the way to undo it. This
   * only reports the drop logic — it never changes it.
   */
  const measured = useMeasuredDrops(deck.deck_id, slide.index);
  const droppedNames = measured.dropped
    .filter((slot) => slot !== "media")
    .map((slot) => SLOT_LABEL[slot] ?? slot);

  const fields: Array<{ key: string; label: string; path: SlotPath; budget?: number; count?: number; rows?: number; right?: React.ReactNode }> = [];
  // The slide-level word budget is the only contract non-hero slots have;
  // the counter measures words against it, exactly as the fit ladder does.
  const wordBudget = wordBudgetFor(slide.archetype, slideHasPicture(slide));
  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
  // A field is only editable if the archetype contract actually draws it.
  // A stray slot the model emitted has no renderer, so editing it changes nothing.
  const allowed = new Set<string>([
    ...(REQUIRED_SLOTS[slide.archetype] ?? []),
    ...(OPTIONAL_SLOTS[slide.archetype] ?? []),
  ]);
  for (const slot of SLOT_ORDER) {
    if (!allowed.has(slot as string)) continue;
    const value = (slide.slots as Slots)[slot];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((_item, i) => {
        const text = readSlot(slide.slots, { slot, i });
        const isHero = slot === "hero_lines";
        fields.push({
          key: `${slot}-${i}`,
          label: `${SLOT_LABEL[slot]}${value.length > 1 ? ` ${i + 1}` : ""}`,
          path: { slot, i },
          budget: isHero ? heroBudgetFor(text, deck.template) : wordBudget,
          count: isHero ? undefined : wordCount(text),
          rows: isHero ? 1 : 2,
          right: isHero ? (
            <button
              type="button"
              onClick={() => onChange(setHeroHighlight(deck, slide.index, i))}
              style={{
                ...labelStyle,
                border: "1px solid var(--border-default)",
                background: (slide.slots.hero_lines?.[i] as any)?.highlight ? "var(--brand)" : "transparent",
                color: (slide.slots.hero_lines?.[i] as any)?.highlight ? "var(--text-inverse)" : "var(--text-muted)",
                borderRadius: 999, padding: "2px 8px", cursor: "pointer",
              }}
            >
              emphasis
            </button>
          ) : undefined,
        });
      });
      continue;
    }
    fields.push({
      key: slot,
      label: SLOT_LABEL[slot] ?? slot,
      path: { slot },
      budget: wordBudget,
      count: wordCount(readSlot(slide.slots, { slot })),
      rows: slot === "body" || slot === "quote" ? 3 : 2,
    });
  }

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: "var(--ff-ui)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          Slide {slide.index + 1} · {ARCHETYPE_LABEL[slide.archetype] ?? slide.archetype}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={onRewrite}
            disabled={rewriting}
            style={{
              ...labelStyle, display: "inline-flex", alignItems: "center", gap: 5,
              border: "1px solid var(--border-default)", background: "var(--surface-card)",
              borderRadius: 999, padding: "5px 10px", cursor: rewriting ? "wait" : "pointer",
            }}
          >
            <RefreshCw size={11} className={rewriting ? "animate-spin" : undefined} />
            {rewriting ? "Rewriting" : "Try another angle"}
          </button>
          {!locked && (
            <button
              type="button"
              onClick={() => onChange(deleteSlide(deck, slide.index))}
              style={{
                ...labelStyle, display: "inline-flex", alignItems: "center", gap: 5,
                border: "1px solid var(--border-default)", background: "var(--surface-card)",
                borderRadius: 999, padding: "5px 10px", cursor: "pointer", color: "var(--error)",
              }}
            >
              <Trash2 size={11} /> Remove
            </button>
          )}
        </span>
      </div>

      {swaps.length > 0 && (
        <div style={{ display: "grid", gap: 5 }}>
          <span style={labelStyle}>Show this as</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {swaps.map((a: Archetype) => (
              <button
                key={a}
                type="button"
                onClick={() => onChange(swapArchetype(deck, slide.index, a))}
                style={{
                  ...labelStyle, border: "1px solid var(--border-default)", background: "var(--surface-card)",
                  borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                }}
              >
                {ARCHETYPE_LABEL[a] ?? a}
              </button>
            ))}
          </div>
        </div>
      )}

      {droppedNames.length > 0 && slide.slots.media?.src && (
        <div
          role="status"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, flexWrap: "wrap",
            border: "1px solid var(--border-default)", borderRadius: 10,
            padding: "8px 11px", background: "var(--surface-card)",
            fontSize: 12.5, lineHeight: 1.6, color: "var(--deadline-text)",
          }}
        >
          <span>
            This photo pushed out {droppedNames.length} line{droppedNames.length === 1 ? "" : "s"}
            {" "}({droppedNames.join(", ")}). The words are still here — they are not being drawn.
          </span>
          <button
            type="button"
            onClick={() => onChange(setSlidePhoto(deck, slide.index, null))}
            style={{
              ...labelStyle, border: "1px solid var(--border-default)", background: "transparent",
              borderRadius: 999, padding: "4px 10px", cursor: "pointer", color: "var(--text-primary)",
            }}
          >
            Remove photo
          </button>
        </div>
      )}


      {fields.map((f) => (
        <Field
          key={f.key}
          label={f.label}
          value={readSlot(slide.slots, f.path)}
          rows={f.rows}
          budget={f.budget}
          count={f.count}
          right={f.right}
          onChange={(v) => onChange(editSlotText(deck, slide.index, f.path, v))}
        />
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            try { await onUploadPhoto(file); } finally { setUploading(false); }
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !canHoldPhoto}
          title={canHoldPhoto ? undefined : "This slide has no room for a photo."}
          style={{
            ...labelStyle, display: "inline-flex", alignItems: "center", gap: 6,
            border: "1px solid var(--border-default)", background: "var(--surface-card)",
            borderRadius: 999, padding: "6px 12px",
            cursor: canHoldPhoto ? "pointer" : "not-allowed",
            opacity: canHoldPhoto ? 1 : 0.5,
          }}
        >
          <ImagePlus size={12} /> {uploading ? "Uploading" : "Add image"}
        </button>
        {slide.slots.media?.src && (
          <button
            type="button"
            onClick={() => onChange(setSlidePhoto(deck, slide.index, null))}
            style={{ ...labelStyle, background: "none", border: "none", cursor: "pointer", color: "var(--error)" }}
          >
            Remove image
          </button>
        )}
      </div>
      {/* A rejection has to be visible where the member clicked, not in a
          panel hundreds of pixels below the fold. */}
      {mediaError && (
        <div style={{ fontSize: 12.5, color: "var(--error)", lineHeight: 1.6 }}>{mediaError}</div>
      )}
      {!canHoldPhoto && (
        <div style={{ ...labelStyle, opacity: 0.7 }}>
          This slide type has no room for a photo. Pick another slide to add one.
        </div>
      )}
      {/* Say the range before the member picks, so nothing is refused after the fact. */}
      {canHoldPhoto && <div style={{ ...labelStyle, opacity: 0.7 }}>
        JPG, PNG or WebP, up to 10MB. Anything larger than a small thumbnail works — Aura crops and resizes it to fit the slide.
        {mediaSupport === "cover" ? " On this slide the photo fills the whole cover behind the words." : ""}
      </div>}
    </div>
  );
}

export default EditPanel;