import { useMemo } from "react";
import type { DoorId, FamilyEntry } from "./renderers";
import { DOOR_FAMILIES } from "./renderers";
import { defaultsFor, useLiveData, type LiveData } from "./useLiveData";
import type { Lang, Mood } from "./renderers/shared";

interface Props {
  door: DoorId;
  lang: Lang;
  mood: Mood;
  live: LiveData;
  onSelect: (family: FamilyEntry) => void;
  onBack: () => void;
}

/**
 * Horizontal filmstrip of card families for the current door. Each tile
 * renders the REAL renderer at small scale, fed with live defaults.
 */
export default function FilmStrip({ door, lang, mood, live, onSelect, onBack }: Props) {
  const families = useMemo(() => DOOR_FAMILIES[door], [door]);
  return (
    <section style={{ maxWidth: 1240, margin: "0 auto" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <h2 style={{
          margin: 0,
          fontFamily: "'Newsreader', serif", fontStyle: "italic", fontWeight: 500,
          fontSize: "clamp(1.4rem, 2.4vw, 1.9rem)",
          color: "var(--ink)", letterSpacing: "-0.01em",
        }}>Pick a card style</h2>
        <button onClick={onBack} style={backBtn}>← Back</button>
      </div>

      <div
        style={{
          display: "flex", flexWrap: "wrap",
          gap: 24, justifyContent: "center", alignItems: "flex-start",
        }}
      >
        {families.map((fam) => {
          const d = defaultsFor(fam.id, live);
          const C = fam.component;
          return (
            <button
              key={fam.id}
              onClick={() => onSelect(fam)}
              className="sig-strip-tile"
              aria-label={`Use ${fam.label} layout`}
            >
              <div className="sig-strip-preview">
                <C lang={lang} mood={mood} name={d.name} title={d.title} lines={d.lines} meta={d.meta} />
              </div>
              <div className="sig-strip-caption">{fam.label}</div>
            </button>
          );
        })}
      </div>

      <style>{STRIP_CSS}</style>
    </section>
  );
}

const backBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink-2)",
  border: "1px solid var(--rule)",
  padding: "8px 18px",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 10,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const STRIP_CSS = `
.sig-strip-tile {
  background: transparent;
  border: 1px solid var(--rule);
  padding: 10px;
  cursor: pointer;
  display: block;
  text-align: inherit;
  color: inherit;
  width: 280px;
  transition: transform .35s cubic-bezier(.22,1,.36,1), border-color .3s ease, box-shadow .35s ease;
}
.sig-strip-tile:hover {
  transform: translateY(-3px);
  border-color: var(--spot);
  box-shadow: 0 18px 40px rgba(0,0,0,0.45);
}
.sig-strip-tile:focus-visible {
  outline: none;
  border-color: var(--spot);
  box-shadow: 0 0 0 2px rgba(212,176,86,0.35);
}
.sig-strip-preview {
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: var(--paper-2);
}
.sig-strip-preview svg { width: 100%; height: 100%; display: block; }
.sig-strip-caption {
  margin-top: 8px;
  text-align: center;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ink-2);
}
`;