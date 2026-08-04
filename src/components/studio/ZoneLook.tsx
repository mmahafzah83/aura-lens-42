import React from "react";
import { THEMES, templateThemes, type ThemeName } from "@/carousel/render/themes";
import { TEMPLATES } from "@/carousel/render/template";
import { T, themeLabel, type Lang } from "./strings";

/**
 * Sourced from the registry, not a hand-kept array. A template reaches the UI
 * only when it has a registered renderer, and a colour set only when its
 * template allows it. A token set with no renderer behind it must never reach
 * a swatch — the member would pick a look that cannot be drawn.
 */
const TEMPLATE_LIST = Object.keys(TEMPLATES).filter((id) => (templateThemes[id] ?? []).length > 0);

function themesFor(template: string): ThemeName[] {
  const allowed = templateThemes[template] ?? [];
  return allowed.filter((t): t is ThemeName => t in THEMES);
}

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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TEMPLATE_LIST.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === template}
            onClick={() => onTemplate(id)}
            style={pill(id === template)}
          >
            {TEMPLATES[id].label[lang === "ar" ? "ar" : "en"]}
          </button>
        ))}
      </div>
      {/* Free, and instant: switching the family re-draws the slides that
          already exist. Nothing is sent anywhere and nothing is re-written. */}
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", margin: 0 }}>
        {T.lookTemplateNote[lang]}
      </p>
    </div>

    <div style={{ display: "grid", gap: 8 }}>
      <p style={heading}>{T.lookTheme[lang]}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {themesFor(template).map((t) => (
          <button
            key={t}
            type="button"
            aria-label={themeLabel(t, lang)}
            aria-pressed={t === theme}
            onClick={() => onTheme(t)}
            style={{
              display: "grid",
              gap: 4,
              justifyItems: "center",
              padding: 0,
              background: "transparent",
              border: 0,
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: 46,
                height: 58,
                borderRadius: 10,
                background: THEMES[t].bg,
                border: `2px solid ${t === theme ? "var(--act)" : "var(--border-default)"}`,
              }}
            />
            <span
              style={{
                fontFamily: "var(--ff-ui)",
                fontSize: 11.5,
                fontWeight: t === theme ? 700 : 500,
                color: t === theme ? "var(--act)" : "var(--text-secondary)",
              }}
            >
              {themeLabel(t, lang)}
            </span>
          </button>
        ))}
      </div>
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