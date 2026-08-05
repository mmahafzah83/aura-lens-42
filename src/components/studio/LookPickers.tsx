import React from "react";
import { THEMES, templateThemes, type ThemeName } from "@/carousel/render/themes";
import { TEMPLATES } from "@/carousel/render/template";
import { themeLabel, type Lang } from "./strings";

/**
 * THE TWO CURATED PICKERS, IN ONE PLACE.
 *
 * The Composer's Look zone and the Settings "Slides" section must offer
 * exactly the same families and exactly the same colours — a default a member
 * sets in Settings that they cannot then see in the Composer would be a lie.
 * So the pickers are one component used twice, sourced from the registry
 * rather than a hand-kept list: a family reaches a member only when it has a
 * registered renderer, and a colour only when its family can draw it.
 */

/** Families with at least one drawable colourway. */
export const TEMPLATE_LIST = Object.keys(TEMPLATES).filter(
  (id) => (templateThemes[id] ?? []).length > 0,
);

/** The colours a family is allowed to draw, in curated order. */
export function themesFor(template: string): ThemeName[] {
  const allowed = templateThemes[template] ?? [];
  return allowed.filter((t): t is ThemeName => t in THEMES);
}

/** The family's first colour — what a member gets when their pick no longer fits. */
export function firstThemeFor(template: string): ThemeName | null {
  return themesFor(template)[0] ?? null;
}

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

export const TemplatePicker: React.FC<{
  lang: Lang;
  value: string;
  onChange: (id: string) => void;
}> = ({ lang, value, onChange }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {TEMPLATE_LIST.map((id) => (
      <button
        key={id}
        type="button"
        aria-pressed={id === value}
        onClick={() => onChange(id)}
        style={pill(id === value)}
      >
        {TEMPLATES[id].label[lang === "ar" ? "ar" : "en"]}
      </button>
    ))}
  </div>
);

export const ColourPicker: React.FC<{
  lang: Lang;
  template: string;
  value: string;
  onChange: (t: ThemeName) => void;
}> = ({ lang, template, value, onChange }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {themesFor(template).map((t) => (
      <button
        key={t}
        type="button"
        aria-label={themeLabel(t, lang)}
        aria-pressed={t === value}
        onClick={() => onChange(t)}
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
            border: `2px solid ${t === value ? "var(--act)" : "var(--border-default)"}`,
          }}
        />
        <span
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 11.5,
            fontWeight: t === value ? 700 : 500,
            color: t === value ? "var(--act)" : "var(--text-secondary)",
          }}
        >
          {themeLabel(t, lang)}
        </span>
      </button>
    ))}
  </div>
);
