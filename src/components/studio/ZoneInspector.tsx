import React, { useRef, useState } from "react";
import type { Archetype, DeckIR, Slots } from "@/carousel/deckIR";
import { ARCHETYPE_LABEL, SLOT_LABEL, SLOT_ORDER } from "@/carousel/studio/slotLabels";
import {
  deleteSlide, editSlotText, heroBudgetFor, isLocked, readSlot, setSlidePhoto,
  shortenSlideForPicture, shortenSlotForPicture, moveSlotToOwnSlide, droppedPictureSlots,
  overPictureBudget, swapArchetype, swappableArchetypes, type SlotPath,
} from "@/carousel/studio/deckEdit";
import { REQUIRED_SLOTS } from "@/carousel/slots";
import { mediaSupport } from "@/carousel/render/Slide";
import { T, archetypeLabelAr, slotLabelAr, slotWontFit, type Lang } from "./strings";
import { useIsPhone } from "./usePhone";

const heading: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontSize: 10.5, letterSpacing: ".09em",
  textTransform: "uppercase", color: "var(--text-muted)", margin: 0,
};

const smallBtn: React.CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)",
  color: "var(--text-primary)",
  fontFamily: "var(--ff-ui)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const SWAPPABLE: Archetype[] = ["frame", "evidence", "benchmark", "quote", "steps", "definition"];

/** RIGHT zone — the words on this one slide, and nothing about the whole deck. */
export const ZoneInspector: React.FC<{
  lang: Lang;
  writeLang: Lang;
  deck: DeckIR | null;
  current: number;
  onDeck: (next: DeckIR) => void;
  /** ONE plain line, or null. Never a list. */
  attention: string | null;
  onChangeLine: () => void;
  changing: boolean;
  onUploadPicture: (file: File) => Promise<void>;
  pictureNotice: string | null;
  onMove: (from: number, to: number) => void;
  /** Z1 — the real state of the member's own portrait, decided upstream. */
  portraitState?: "ready" | "preparing" | "failed" | "none";
}> = ({
  lang, writeLang, deck, current, onDeck, attention, onChangeLine, changing,
  onUploadPicture, pictureNotice, onMove, portraitState = "none",
}) => {
  const slotLabel = (key: string) =>
    (lang === "ar" ? slotLabelAr[key] : undefined) ?? SLOT_LABEL[key] ?? key;
  const archetypeLabel = (key: string) =>
    (lang === "ar" ? archetypeLabelAr[key] : undefined) ?? ARCHETYPE_LABEL[key] ?? key;

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shortenNote, setShortenNote] = useState<string | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const rtl = writeLang === "ar";
  // M4 — 16px on a phone, so iOS never zooms the page when a field is focused.
  const isPhone = useIsPhone();
  const fieldSize = isPhone ? 16 : 14;

  const slide = deck?.slides[Math.min(current, (deck?.slides.length ?? 1) - 1)] ?? null;

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        background: isPhone ? "transparent" : "var(--surface-card)",
        border: isPhone ? "0" : "1px solid var(--border-default)",
        borderRadius: 14,
        padding: isPhone ? 0 : 14,
        display: "grid",
        gap: 14,
        minWidth: 0,
      }}
    >
      {!isPhone && <p style={heading}>{T.zoneInspector[lang]}</p>}
      {children}
    </div>
  );

  if (!deck || !slide) {
    return shell(
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
        {T.noSlidesYet[lang]}
      </p>,
    );
  }

  const locked = isLocked(deck, slide);
  const available = swappableArchetypes(deck, slide);
  const canHoldPicture = mediaSupport(slide.archetype) !== "none";
  // The refusal names the actual reason for THIS slide, not a generic shrug.
  const refusal =
    slide.archetype === "benchmark" ? T.noPictureBenchmark[lang]
    : slide.archetype === "steps" ? T.noPictureSteps[lang]
    : slide.archetype === "close" ? T.noPictureClose[lang]
    : T.noPictureHere[lang];
  const tooLong = overPictureBudget(slide);
  /**
   * Z2 — WHAT THE PICTURE VARIANT CANNOT DRAW, BY NAME.
   *
   * The renderer and this list come from the SAME `pictureTextPlan`, so a
   * slot can never be missing from the slide without appearing here. A
   * picture slide carries the hook and one supporting line; anything else the
   * member filled in is reported, never quietly discarded.
   */
  const dropped = droppedPictureSlots(slide);

  // A move only happens if the landing position is itself movable, so the
  // button is disabled whenever `moveSlide` would return the deck unchanged.
  const landingFree = (to: number) => {
    if (to < 0 || to >= deck.slides.length) return false;
    const target = deck.slides.find((s) => s.index === to);
    return Boolean(target) && !isLocked(deck, target!);
  };
  const canMoveEarlier = !locked && landingFree(slide.index - 1);
  const canMoveLater = !locked && landingFree(slide.index + 1);

  const fields: Array<{ key: string; label: string; path: SlotPath; budget?: number; rows: number }> = [];
  for (const slot of SLOT_ORDER) {
    const value = (slide.slots as Slots)[slot];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((_item, i) => {
        const text = readSlot(slide.slots, { slot, i });
        const isHero = slot === "hero_lines";
        fields.push({
          key: `${slot}-${i}`,
          label: `${slotLabel(slot)}${value.length > 1 ? ` ${i + 1}` : ""}`,
          path: { slot, i },
          budget: isHero ? heroBudgetFor(text) : undefined,
          rows: isHero ? 1 : 2,
        });
      });
      continue;
    }
    fields.push({
      key: slot,
      label: slotLabel(slot),
      path: { slot },
      rows: slot === "body" || slot === "quote" ? 3 : 2,
    });
  }

  const neighbours = new Set(
    [deck.slides[slide.index - 1]?.archetype, deck.slides[slide.index + 1]?.archetype].filter(Boolean) as Archetype[],
  );
  const filled = (name: string) => {
    const v = (slide.slots as any)[name];
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  };

  return shell(
    <>
      {attention && (
        <p
          role="status"
          aria-live="polite"
          style={{
            fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.6, margin: 0,
            padding: "10px 12px", borderRadius: 10,
            background: "var(--error-tint)", color: "var(--error)",
          }}
        >
          {attention}
        </p>
      )}

      {fields.map((f) => {
        const value = readSlot(slide.slots, f.path);
        const over = f.budget !== undefined && value.length > f.budget;
        return (
          <div key={f.key} style={{ display: "grid", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <label htmlFor={`studio-slot-${slide.index}-${f.key}`} style={heading}>{f.label}</label>
              {f.budget !== undefined && (
                <span
                  style={{ ...heading, color: over ? "var(--error)" : "var(--text-muted)" }}
                >
                  {value.length}/{f.budget}
                </span>
              )}
            </div>
            <textarea
              id={`studio-slot-${slide.index}-${f.key}`}
              value={value}
              rows={f.rows}
              dir={rtl ? "rtl" : "ltr"}
              onChange={(e) => onDeck(editSlotText(deck, slide.index, f.path, e.target.value))}
              style={{
                width: "100%",
                minHeight: 44,
                background: "var(--surface-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                padding: "9px 11px",
                fontFamily: "var(--ff-ui)",
                fontSize: fieldSize,
                lineHeight: rtl ? 1.9 : 1.75,
                textAlign: rtl ? "right" : "left",
                color: "var(--text-primary)",
                resize: "vertical",
              }}
            />
          </div>
        );
      })}

      <div style={{ display: "grid", gap: 6 }}>
        <p style={heading}>{T.picture[lang]}</p>
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
            try { await onUploadPicture(file); } finally { setUploading(false); }
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !canHoldPicture}
            style={{ ...smallBtn, opacity: canHoldPicture ? 1 : 0.5, cursor: canHoldPicture ? "pointer" : "not-allowed" }}
          >
            {uploading ? T.uploading[lang] : T.addPicture[lang]}
          </button>
          {slide.slots.media?.src && (
            <button
              type="button"
              onClick={() => onDeck(setSlidePhoto(deck, slide.index, null))}
              style={{ ...smallBtn, color: "var(--error)", borderColor: "var(--error)" }}
            >
              {T.removePicture[lang]}
            </button>
          )}
        </div>
        {!canHoldPicture && (
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            {refusal}
          </p>
        )}
        {/* A picture variant with more words than it can hold. The member is
            told plainly and offered a deterministic trim — or may keep every
            word and drop the picture instead. Nothing is cut behind their back. */}
        {canHoldPicture && tooLong && (
          <div style={{ display: "grid", gap: 6 }}>
            <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-primary)", margin: 0 }}>
              {T.tooLongForPicture[lang]}
            </p>
            <div>
              <button type="button" onClick={() => onDeck(shortenSlideForPicture(deck, slide.index))} style={smallBtn}>
                {T.shortenForPicture[lang]}
              </button>
            </div>
            <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
              {T.keepAllWords[lang]}
            </p>
          </div>
        )}
        {pictureNotice && (
          <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--error)", margin: 0 }}>
            {pictureNotice}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onChangeLine} disabled={changing} style={smallBtn}>
          {changing ? T.changingLine[lang] : T.changeLine[lang]}
        </button>
        {!locked && (
          <button
            type="button"
            onClick={() => onDeck(deleteSlide(deck, slide.index))}
            style={{ ...smallBtn, color: "var(--error)", borderColor: "var(--error)" }}
          >
            {T.removeSlide[lang]}
          </button>
        )}
      </div>

      {/* Reordering by button. Every move here works with a single tap; no
          dragging is required anywhere (WCAG 2.2 SC 2.5.7). */}
      <div style={{ display: "grid", gap: 6 }}>
        {locked ? (
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
            {slide.index === 0 ? T.alwaysFirst[lang] : T.alwaysLast[lang]}
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={!canMoveEarlier}
                onClick={() => onMove(slide.index, slide.index - 1)}
                style={{ ...smallBtn, opacity: canMoveEarlier ? 1 : 0.55, cursor: canMoveEarlier ? "pointer" : "not-allowed" }}
              >
                {lang === "ar" ? `${T.moveEarlier[lang]} →` : `← ${T.moveEarlier[lang]}`}
              </button>
              <button
                type="button"
                disabled={!canMoveLater}
                onClick={() => onMove(slide.index, slide.index + 1)}
                style={{ ...smallBtn, opacity: canMoveLater ? 1 : 0.55, cursor: canMoveLater ? "pointer" : "not-allowed" }}
              >
                {lang === "ar" ? `← ${T.moveLater[lang]}` : `${T.moveLater[lang]} →`}
              </button>
            </div>
            {!canMoveEarlier && (
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
                {T.cannotMoveEarlier[lang]}
              </p>
            )}
            {!canMoveLater && (
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
                {T.cannotMoveLater[lang]}
              </p>
            )}
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <button
          type="button"
          onClick={() => setLayoutOpen((v) => !v)}
          aria-expanded={layoutOpen}
          style={{
            background: "transparent", border: 0, padding: 0, minHeight: 44,
            textAlign: lang === "ar" ? "right" : "left", cursor: "pointer",
            fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--act)",
          }}
        >
          {T.layoutDisclosure[lang]} {layoutOpen ? "▴" : "▾"}
        </button>
        {layoutOpen && (
          <div style={{ display: "grid", gap: 8 }}>
            {locked && (
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-muted)", margin: 0 }}>
                {T.lockedLayout[lang]}
              </p>
            )}
            {!locked && SWAPPABLE.filter((a) => a !== slide.archetype).map((a) => {
              const ok = available.includes(a);
              const reason = neighbours.has(a)
                ? T.reasonNeighbour[lang]
                : !REQUIRED_SLOTS[a].every(filled)
                  ? T.reasonMissing[lang]
                  : "";
              return (
                <div key={a} style={{ display: "grid", gap: 3 }}>
                  <button
                    type="button"
                    disabled={!ok}
                    onClick={() => onDeck(swapArchetype(deck, slide.index, a))}
                    style={{
                      ...smallBtn,
                      textAlign: lang === "ar" ? "right" : "left",
                      opacity: ok ? 1 : 0.55,
                      cursor: ok ? "pointer" : "not-allowed",
                    }}
                  >
                    {archetypeLabel(a)}
                  </button>
                  {!ok && (
                    <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
                      {T.cannotUse[lang]} — {reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </>,
  );
};

export default ZoneInspector;