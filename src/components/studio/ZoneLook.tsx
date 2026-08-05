import React from "react";
import { type ThemeName } from "@/carousel/render/themes";
import { T, type Lang } from "./strings";
import { ColourPicker, TemplatePicker } from "./LookPickers";

const heading: React.CSSProperties = {
  fontFamily: "var(--ff-mono)",
  fontSize: 10.5,
  letterSpacing: ".09em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: 0,
};

const pill = (on: boolean): React.CSSProperties => ({
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "var(--ff-ui)",
  fontSize: 13,
  fontWeight: on ? 700 : 500,
  background: on ? "var(--act-tint)" : "var(--surface-subtle)",
  color: on ? "var(--act)" : "var(--text-secondary)",
  border: `1px solid ${on ? "var(--act)" : "var(--border-default)"}`,
});

/** RIGHT zone, "Look" tab — colours and how many slides. */
export const ZoneLook: React.FC<{
  lang: Lang;
  theme: ThemeName;
  onTheme: (t: ThemeName) => void;
  template: string;
  onTemplate: (id: string) => void;
  length: 5 | 7 | 10;
  onLength: (n: 5 | 7 | 10) => void;
  hasDeck: boolean;
}> = ({ lang, theme, onTheme, template, onTemplate, length, onLength, hasDeck }) => (
  <div
    style={{
      background: "var(--surface-card)",
      border: "1px solid var(--border-default)",
      borderRadius: 14,
      padding: 14,
      display: "grid",
      gap: 16,
      minWidth: 0,
    }}
  >
    <p style={heading}>{T.lookHead[lang]}</p>

    <div style={{ display: "grid", gap: 8 }}>
      <p style={heading}>{T.lookTemplate[lang]}</p>
      <TemplatePicker lang={lang} value={template} onChange={onTemplate} />
      {/* Free, and instant: switching the family re-draws the slides that
          already exist. Nothing is sent anywhere and nothing is re-written. */}
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
        {T.lookTemplateNote[lang]}
      </p>
    </div>

    <div style={{ display: "grid", gap: 8 }}>
      <p style={heading}>{T.lookTheme[lang]}</p>
      <ColourPicker lang={lang} template={template} value={theme} onChange={onTheme} />
    </div>

    <div style={{ display: "grid", gap: 8 }}>
      <p style={heading}>{T.lookLength[lang]}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([5, 7, 10] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === length}
            onClick={() => onLength(n)}
            style={pill(n === length)}
          >
            {n}
          </button>
        ))}
      </div>
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
        {hasDeck ? T.lookLengthNote[lang] : T.lookNeedsDeck[lang]}
      </p>
    </div>
  </div>
);

export default ZoneLook;