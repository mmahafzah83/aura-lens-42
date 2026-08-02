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
import {
  deleteSlide, editSlotText, heroBudgetFor, isLocked, readSlot,
  setHeroHighlight, setSlidePhoto, swapArchetype, swappableArchetypes, type SlotPath,
} from "./deckEdit";

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
  label, value, rows, budget, onChange, right,
}: {
  label: string;
  value: string;
  rows?: number;
  budget?: number;
  onChange: (v: string) => void;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {budget !== undefined && (
            <span style={{ ...labelStyle, color: counterColour(value.length, budget) }}>
              {value.length}/{budget}
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
  deck, slide, onChange, onRewrite, rewriting, onUploadPhoto,
}: {
  deck: DeckIR;
  slide: Slide;
  onChange: (next: DeckIR) => void;
  onRewrite: () => void;
  rewriting: boolean;
  onUploadPhoto: (file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const locked = isLocked(deck, slide);
  const swaps = swappableArchetypes(deck, slide);

  const fields: Array<{ key: string; label: string; path: SlotPath; budget?: number; rows?: number; right?: React.ReactNode }> = [];
  for (const slot of SLOT_ORDER) {
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
          budget: isHero ? heroBudgetFor(text) : undefined,
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

      {fields.map((f) => (
        <Field
          key={f.key}
          label={f.label}
          value={readSlot(slide.slots, f.path)}
          rows={f.rows}
          budget={f.budget}
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
          disabled={uploading}
          style={{
            ...labelStyle, display: "inline-flex", alignItems: "center", gap: 6,
            border: "1px solid var(--border-default)", background: "var(--surface-card)",
            borderRadius: 999, padding: "6px 12px", cursor: "pointer",
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
    </div>
  );
}

export default EditPanel;