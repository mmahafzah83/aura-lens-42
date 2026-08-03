import React from "react";
import { ButtonPrimary } from "@/components/systemb";
import { T, type Lang, type Posture } from "./strings";

const OPTIONS: Array<{ value: Posture; label: keyof typeof T; sub: keyof typeof T }> = [
  { value: "delegator", label: "postureDelegator", sub: "postureDelegatorSub" },
  { value: "editor", label: "postureEditor", sub: "postureEditorSub" },
  { value: "author", label: "postureAuthor", sub: "postureAuthorSub" },
];

export const PostureQuestion: React.FC<{
  lang: Lang;
  value: Posture;
  onChange: (p: Posture) => void;
  onContinue: () => void;
}> = ({ lang, value, onChange, onContinue }) => (
  <div style={{ maxWidth: 560, margin: "48px auto 0" }}>
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      <h1
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        {T.postureHead[lang]}
      </h1>
      <p
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--text-secondary)",
          margin: "8px 0 18px",
        }}
      >
        {T.postureSub[lang]}
      </p>

      <div role="radiogroup" aria-label={T.postureHead[lang]} style={{ display: "grid", gap: 10 }}>
        {OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                minHeight: 44,
                padding: 14,
                borderRadius: 12,
                cursor: "pointer",
                background: on ? "var(--act-tint)" : "var(--surface-subtle)",
                border: `1px solid ${on ? "var(--act)" : "var(--border-default)"}`,
              }}
            >
              <input
                type="radio"
                name="aura-studio-posture"
                checked={on}
                onChange={() => onChange(o.value)}
                style={{ marginTop: 3, width: 18, height: 18, accentColor: "var(--act)" }}
              />
              <span>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--ff-ui)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {String(T[o.label][lang])}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--ff-ui)",
                    fontSize: 13.5,
                    lineHeight: 1.7,
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  {String(T[o.sub][lang])}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <ButtonPrimary onClick={onContinue} style={{ minHeight: 44 }}>
          {T.continue[lang]} →
        </ButtonPrimary>
      </div>
    </div>
  </div>
);

export default PostureQuestion;