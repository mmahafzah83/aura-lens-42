import { useEffect, useState, useCallback, useRef } from "react";
import MiniPreview from "@/components/signature/MiniPreview";
import FilmStrip from "@/components/signature/FilmStrip";
import Editor, { type EditorFields } from "@/components/signature/Editor";
import Preview from "@/components/signature/Preview";
import Publish from "@/components/signature/Publish";
import { useLiveData, defaultsFor } from "@/components/signature/useLiveData";
import type { FamilyEntry } from "@/components/signature/renderers";
import type { Lang, Mood } from "@/components/signature/renderers/shared";

/**
 * Signature Studio — shell.
 * System-A tokens only. Dark stage (--ob-bg) with three 3D doors.
 * Motion: pure CSS 3D, no library, no looping animation.
 */

type DoorId = "me" | "photo" | "words";
type Step = "doors" | "filmstrip" | "editor" | "preview" | "publish";

interface Door {
  id: DoorId;
  title: string;
  plate: string;
  desc: string;
  variant: "cover" | "frame" | "line";
  delayMs: number;
}

const DOORS: Door[] = [
  { id: "me", title: "Me", plate: "Cover · Signature", desc: "A card about you — your name, your title, your standing.", variant: "cover", delayMs: 0 },
  { id: "photo", title: "A photo", plate: "The Frame", desc: "Any picture you have — Aura adds one sharp line.", variant: "frame", delayMs: 110 },
  { id: "words", title: "Just words", plate: "The Line", desc: "No photo. Your line, framed.", variant: "line", delayMs: 220 },
];

const STEP_LABEL: Record<Step, string> = {
  doors: "Doors",
  filmstrip: "Filmstrip",
  editor: "Editor",
  preview: "Preview",
  publish: "Publish",
};

export default function SignatureStudio() {
  const [openDoor, setOpenDoor] = useState<DoorId | null>(null);
  const [step, setStep] = useState<Step>("doors");
  const [family, setFamily] = useState<FamilyEntry | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [mood, setMood] = useState<Mood>("oxblood");
  const [fields, setFields] = useState<EditorFields>({
    name: "", title: "", line1: "", line2: "", meta: "",
  });
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [pickedSource, setPickedSource] = useState<"profile" | "signal" | "voice" | null>(null);
  const live = useLiveData();
  const doorRefs = useRef<Record<DoorId, HTMLDivElement | null>>({
    me: null, photo: null, words: null,
  });

  const openDoorNow = useCallback((id: DoorId) => {
    setOpenDoor(id);
    setStep("filmstrip");
  }, []);

  const closeAll = useCallback(() => {
    setOpenDoor(null);
    setStep("doors");
    setFamily(null);
  }, []);

  const selectFamily = useCallback((fam: FamilyEntry) => {
    setFamily(fam);
    const d = defaultsFor(fam.id, live);
    setFields({
      name: d.name,
      title: d.title,
      line1: d.lines[0] || "",
      line2: d.lines[1] || "",
      meta: d.meta,
    });
    setPickedSource(null);
    setStep("editor");
  }, [live]);

  const stepBack = useCallback(() => {
    if (step === "publish") setStep("preview");
    else if (step === "preview") setStep("editor");
    else if (step === "editor") setStep("filmstrip");
    else if (step === "filmstrip") { setOpenDoor(null); setStep("doors"); setFamily(null); }
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stepBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBack]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ob-bg)",
        color: "var(--ink, #E7E1D3)",
        // Scoped System-A dark surface tokens. Override --paper/--ink so
        // nested components (MiniPreview, buttons) resolve against the
        // dark stage instead of bare shadcn :root defaults.
        ["--paper" as any]: "var(--ob-panel)",
        ["--paper-2" as any]: "var(--ob-raised)",
        ["--paper-3" as any]: "var(--ob-field)",
        ["--ink" as any]: "#E7E1D3",
        ["--ink-2" as any]: "#B8B0A0",
        ["--ink-3" as any]: "#7A7466",
        ["--rule" as any]: "rgba(231,225,211,0.14)",
        ["--spot" as any]: "#D4B056",
        ["--font-serif" as any]: "'Newsreader', serif",
        fontFamily: "'Newsreader', serif",
        padding: "56px 24px 96px",
      }}
    >
      <style>{CSS_3D}</style>

      <header style={{ maxWidth: 1120, margin: "0 auto 40px" }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 10,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "var(--spot)",
          }}
        >
          Signature Studio
        </div>
        <h1
          style={{
            margin: "8px 0 6px",
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: "var(--ink)",
          }}
        >
          Signature
        </h1>
        <p
          style={{
            margin: 0,
            fontFamily: "'Newsreader', serif",
            fontSize: 18,
            lineHeight: 1.5,
            color: "var(--ink-2)",
            maxWidth: 620,
          }}
        >
          Your expertise, in one frame.
        </p>
      </header>

      {/* Step indicator */}
      <nav
        aria-label="Studio steps"
        style={{
          maxWidth: 1120,
          margin: "0 auto 32px",
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}
      >
        {(Object.keys(STEP_LABEL) as Step[]).map((s, i) => {
          const active = s === step;
          return (
            <span
              key={s}
              style={{
                color: active ? "var(--spot)" : "var(--ink-3)",
                borderBottom: active ? "1px solid var(--spot)" : "1px solid transparent",
                paddingBottom: 4,
              }}
            >
              {String(i + 1).padStart(2, "0")} · {STEP_LABEL[s]}
            </span>
          );
        })}
      </nav>

      {step === "doors" || openDoor === null ? (
        <section
          className="sig-doors"
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 28,
          }}
        >
          {DOORS.map((d) => (
            <DoorCard
              key={d.id}
              door={d}
              isOpen={openDoor === d.id}
              onOpen={() => openDoorNow(d.id)}
              onClose={closeAll}
              refCb={(el) => { doorRefs.current[d.id] = el; }}
            />
          ))}
        </section>
      ) : step === "filmstrip" ? (
        <FilmStrip
          door={openDoor}
          lang={lang}
          mood={mood}
          live={live}
          onSelect={selectFamily}
          onBack={() => { setOpenDoor(null); setStep("doors"); setFamily(null); }}
        />
      ) : step === "editor" && family ? (
        <Editor
          family={family}
          lang={lang}
          mood={mood}
          fields={fields}
          photoUrl={photoUrl}
          onLang={setLang}
          onMood={setMood}
          onFields={setFields}
          onPhoto={setPhotoUrl}
          onPickedSource={setPickedSource}
          onBack={() => setStep("filmstrip")}
          onContinue={() => setStep("preview")}
        />
      ) : step === "preview" && family ? (
        <Preview
          family={family}
          lang={lang}
          mood={mood}
          fields={fields}
          photoUrl={photoUrl}
          onBack={() => setStep("editor")}
          onContinue={() => setStep("publish")}
        />
      ) : step === "publish" && family ? (
        <Publish
          family={family}
          lang={lang}
          mood={mood}
          fields={fields}
          photoUrl={photoUrl}
          pickedSource={pickedSource}
          onBack={() => setStep("preview")}
          onMakeAnother={() => {
            setOpenDoor(null);
            setFamily(null);
            setPhotoUrl(undefined);
            setPickedSource(null);
            setFields({ name: "", title: "", line1: "", line2: "", meta: "" });
            setStep("doors");
          }}
        />
      ) : (
        <StepPlaceholder step={step} onBack={() => setStep("preview")} doorId={openDoor} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Door                                                                       */
/* -------------------------------------------------------------------------- */

interface DoorCardProps {
  door: Door;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  refCb: (el: HTMLDivElement | null) => void;
}

function DoorCard({ door, isOpen, onOpen, onClose, refCb }: DoorCardProps) {
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isOpen) onClose();
      else onOpen();
    }
  };

  return (
    <div
      ref={refCb}
      className={`sig-door-frame${isOpen ? " is-open" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={isOpen}
      aria-label={`${door.title} — ${door.plate}`}
      onClick={() => (isOpen ? onClose() : onOpen())}
      onKeyDown={handleKey}
      style={{ animationDelay: `${door.delayMs}ms` }}
    >
      {/* Room behind the leaf */}
      <div className="sig-door-room">
        <div className="sig-door-room-inner">
          <MiniPreview variant={door.variant} compact />
        </div>
      </div>

      {/* The leaf */}
      <div className="sig-door-leaf">
        <div className="sig-door-leaf-face">
          <div className="sig-door-plate">{door.plate}</div>
        <div>
          <div className="sig-door-title">{door.title}</div>
          <div className="sig-door-desc">{door.desc}</div>
        </div>
          <div className="sig-door-handle" aria-hidden />
        </div>
        <div className="sig-door-light" aria-hidden />
      </div>

      <div className="sig-door-shadow" aria-hidden />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step placeholder                                                           */
/* -------------------------------------------------------------------------- */

function StepPlaceholder({
  step,
  onBack,
  doorId,
}: {
  step: Step;
  onBack: () => void;
  doorId: DoorId;
}) {
  return (
    <section
      style={{
        maxWidth: 900,
        margin: "0 auto",
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        padding: 40,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--spot)",
        }}
      >
        {STEP_LABEL[step]} — placeholder
      </div>
      <h2
        style={{
          margin: "12px 0",
          fontFamily: "'Newsreader', serif",
          fontStyle: "italic",
          fontSize: 28,
          color: "var(--ink)",
        }}
      >
        Coming next
      </h2>
      <p style={{ color: "var(--ink-2)", margin: "0 0 20px" }}>
        You opened <em>{doorId}</em>. The {step} panel will live here.
      </p>
      <button
        onClick={onBack}
        style={{
          background: "transparent",
          color: "var(--ink)",
          border: "1px solid var(--spot)",
          padding: "10px 22px",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        ← Back
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* CSS — 3D doors, mobile stack, reduced motion                               */
/* -------------------------------------------------------------------------- */

const CSS_3D = `
.sig-door-frame {
  position: relative;
  aspect-ratio: 3 / 4;
  perspective: 1400px;
  transform-style: preserve-3d;
  cursor: pointer;
  outline: none;
  opacity: 0;
  transform: translateY(18px);
  animation: sigDoorEnter 0.7s cubic-bezier(.22,1,.36,1) forwards;
}
.sig-door-frame:focus-visible {
  box-shadow: 0 0 0 2px var(--spot), 0 0 0 4px rgba(212,176,86,0.25);
}
@keyframes sigDoorEnter {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}

.sig-door-room {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 30% 40%, rgba(245,217,160,0.10), transparent 60%),
    linear-gradient(180deg, #0A0F16 0%, #05080C 100%);
  border: 1px solid var(--rule);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 30px 80px rgba(0,0,0,0.7);
}
.sig-door-room-inner {
  transform: scale(0.86);
  opacity: 0;
  transition: transform 0.6s cubic-bezier(.22,1,.36,1) 0.3s,
              opacity 0.4s ease 0.3s;
  width: 82%;
  display: flex;
  justify-content: center;
}
.sig-door-frame.is-open .sig-door-room-inner {
  transform: scale(1);
  opacity: 1;
}

.sig-door-leaf {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  backface-visibility: hidden;
  transform: rotateY(0deg);
  transition: transform 0.9s cubic-bezier(.34,1.1,.3,1),
              box-shadow 0.9s cubic-bezier(.34,1.1,.3,1);
  box-shadow: 0 12px 30px rgba(0,0,0,0.5);
  will-change: transform;
}
.sig-door-leaf-face {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, #1A2129 0%, #10161E 60%, #0A0F16 100%);
  border: 1px solid var(--rule);
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.sig-door-plate {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 9.5px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--spot);
}
.sig-door-title {
  font-family: 'Newsreader', serif;
  font-style: italic;
  font-weight: 500;
  font-size: clamp(1.8rem, 3.2vw, 2.4rem);
  letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1.05;
}
.sig-door-desc {
  font-family: 'Newsreader', serif;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-2);
  max-width: 90%;
  margin-top: 8px;
  padding-right: 26px;
}
.sig-door-handle {
  position: absolute;
  right: 16px;
  top: 50%;
  width: 4px;
  height: 44px;
  background: linear-gradient(180deg, #E6C36F 0%, #B48C34 100%);
  transform: translateY(-50%);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(230,195,111,0.35);
}
.sig-door-light {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    rgba(245,217,160,0.35) 0%,
    rgba(245,217,160,0.10) 22%,
    transparent 60%);
  opacity: 0;
  transition: opacity 0.6s ease;
  pointer-events: none;
}
.sig-door-shadow {
  position: absolute;
  inset: auto 0 -18px 0;
  height: 24px;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%);
  transform: scaleY(0.6);
  opacity: 0.6;
  transition: opacity 0.9s ease, transform 0.9s ease;
  pointer-events: none;
}

@media (hover: hover) {
  .sig-door-frame:hover .sig-door-leaf {
    transform: rotateY(-16deg);
    box-shadow: 0 20px 40px rgba(0,0,0,0.55);
  }
  .sig-door-frame:hover .sig-door-light {
    opacity: 1;
  }
}

.sig-door-frame.is-open .sig-door-leaf {
  transform: rotateY(-82deg);
  box-shadow: 0 30px 60px rgba(0,0,0,0.7);
}
.sig-door-frame.is-open .sig-door-light {
  opacity: 1;
}
.sig-door-frame.is-open .sig-door-shadow {
  opacity: 0.9;
  transform: scaleY(1);
}

@media (max-width: 760px) {
  .sig-doors { grid-template-columns: 1fr !important; }
  .sig-door-frame { aspect-ratio: 4 / 3; }
}

@media (prefers-reduced-motion: reduce) {
  .sig-door-frame,
  .sig-door-leaf,
  .sig-door-light,
  .sig-door-shadow,
  .sig-door-room-inner {
    animation: none !important;
    transition: none !important;
  }
  .sig-door-frame { opacity: 1; transform: none; }
  .sig-door-room-inner { opacity: 1; transform: scale(1); }
}
`;