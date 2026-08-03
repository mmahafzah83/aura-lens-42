import React from "react";
import { T, type Lang } from "./strings";

const heading: React.CSSProperties = {
  fontFamily: "var(--ff-mono)",
  fontSize: 10.5,
  letterSpacing: ".09em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: 0,
};

/** LEFT zone — the subject of this piece, and where you are. Nothing else. */
export const ZonePiece: React.FC<{
  lang: Lang;
  subject: string;
  todo: { words: boolean; slides: boolean; cover: boolean; published: boolean };
}> = ({ lang, subject, todo }) => {
  const checks: Array<[string, boolean]> = [
    [T.todoWords[lang], todo.words],
    [T.todoSlides[lang], todo.slides],
    [T.todoCover[lang], todo.cover],
    [T.todoPublish[lang], todo.published],
  ];

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 14,
        padding: 14,
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