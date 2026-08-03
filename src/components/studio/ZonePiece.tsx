import React, { useState } from "react";
import { T, type Lang } from "./strings";
import { useIsPhone } from "./usePhone";

const heading: React.CSSProperties = {
  fontFamily: "var(--ff-mono)",
  fontSize: 10.5,
  letterSpacing: ".09em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: 0,
};

/** LEFT zone — the subject of this post, and where you are. Nothing else. */
export const ZonePiece: React.FC<{
  lang: Lang;
  writeLang: Lang;
  subject: string;
  /** The member's own sentences. Never absent from a screen they stand on. */
  content: string;
  onContentChange: (next: string) => void;
  todo: { words: boolean; slides: boolean; cover: boolean; published: boolean };
  /**
   * P6 — on the slides path the words are the PREVIOUS step and belong there.
   * This panel then shows the subject and what is still to do, nothing else.
   */
  showWords?: boolean;
}> = ({ lang, writeLang, subject, content, onContentChange, todo, showWords = true }) => {
  const [editing, setEditing] = useState(false);
  const rtl = writeLang === "ar";
  // M4 — never below 16px on a phone, or iOS zooms the page on focus.
  const isPhone = useIsPhone();
  const checks: Array<[string, boolean]> = [
    [T.todoWords[lang], todo.words],
    [T.todoSlides[lang], todo.slides],
    [T.todoCover[lang], todo.cover],
    [T.todoPublish[lang], todo.published],
  ];

  return (
    <div
      style={{
        background: isPhone ? "transparent" : "var(--surface-card)",
        border: isPhone ? "0" : "1px solid var(--border-default)",
        borderRadius: 14,
        padding: isPhone ? 0 : 14,
        display: "grid",
        gap: 16,
      }}
    >
      <div>
        <p style={heading}>{T.zonePiece[lang]}</p>
        <p
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 14.5,
            fontWeight: 700,
            lineHeight: 1.5,
            color: "var(--text-primary)",
            margin: "6px 0 0",
          }}
        >
          {subject || "—"}
        </p>
      </div>

      {showWords && (
      <div>
        <p style={heading}>{T.yourWords[lang]}</p>
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={10}
            dir={rtl ? "rtl" : "ltr"}
            aria-label={T.yourWords[lang]}
            style={{
              width: "100%",
              marginTop: 6,
              background: "var(--surface-subtle)",
              border: "1px solid var(--border-default)",
              borderRadius: 10,
              padding: 10,
              fontFamily: "var(--ff-ui)",
              fontSize: isPhone ? 16 : 13,
              lineHeight: rtl ? 1.9 : 1.75,
              textAlign: rtl ? "right" : "left",
              color: "var(--text-primary)",
              resize: "vertical",
            }}
          />
        ) : (
          <p
            dir={rtl ? "rtl" : "ltr"}
            style={{
              fontFamily: "var(--ff-ui)",
              fontSize: 13,
              lineHeight: 1.75,
              whiteSpace: "pre-wrap",
              textAlign: rtl ? "right" : "left",
              color: "var(--text-secondary)",
              margin: "6px 0 0",
            }}
          >
            {content.trim() ? content.trim().slice(0, 220) + (content.trim().length > 220 ? "…" : "") : "—"}
          </p>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          style={{
            minHeight: 44,
            padding: 0,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            fontFamily: "var(--ff-ui)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--act)",
          }}
        >
          {editing ? T.hideWords[lang] : T.editWords[lang]}
        </button>
        {editing && (
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
            {T.editHint[lang]}
          </p>
        )}
      </div>
      )}

      <div>
        <p style={heading}>{T.stillToDo[lang]}</p>
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {checks.map(([label, ok]) => (
            <li
              key={label}
              style={{
                fontFamily: "var(--ff-ui)",
                fontSize: 13,
                color: ok ? "var(--text-primary)" : "var(--text-muted)",
                display: "flex",
                gap: 8,
              }}
            >
              <span aria-hidden="true">{ok ? "✓" : "○"}</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", margin: "8px 0 0" }}>
          {T.todoNote[lang]}
        </p>
      </div>
    </div>
  );
};

export default ZonePiece;