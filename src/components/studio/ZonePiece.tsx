import React, { useState } from "react";
import { T, type Lang } from "./strings";

export type ShowingKey = "post" | "slides";

const heading: React.CSSProperties = {
  fontFamily: "var(--ff-mono)",
  fontSize: 10.5,
  letterSpacing: ".09em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: 0,
};

/** LEFT zone — what this piece is, what is on screen, and where you are. */
export const ZonePiece: React.FC<{
  lang: Lang;
  writeLang: Lang;
  subject: string;
  showing: ShowingKey;
  onShowing: (k: ShowingKey) => void;
  slideCount: number;
  todo: { words: boolean; slides: boolean; cover: boolean; published: boolean };
  postText: string;
}> = ({ lang, writeLang, subject, showing, onShowing, slideCount, todo, postText }) => {
  const [open, setOpen] = useState(false);
  const rtl = writeLang === "ar";

  const rows: Array<{ key: ShowingKey; label: string }> = [
    { key: "post", label: T.showPost[lang] },
    { key: "slides", label: `${T.showSlides[lang]} · ${slideCount}` },
  ];

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
        <p style={heading}>{T.showing[lang]}</p>
        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onShowing(r.key)}
              style={{
                minHeight: 44,
                textAlign: lang === "ar" ? "right" : "left",
                padding: "0 10px",
                borderRadius: 9,
                cursor: "pointer",
                fontFamily: "var(--ff-ui)",
                fontSize: 13.5,
                fontWeight: showing === r.key ? 700 : 500,
                background: showing === r.key ? "var(--act-tint)" : "transparent",
                color: showing === r.key ? "var(--act)" : "var(--text-secondary)",
                border: `1px solid ${showing === r.key ? "var(--act)" : "transparent"}`,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
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

      <div>
        <p style={heading}>{T.showPost[lang]}</p>
        <p
          dir={rtl ? "rtl" : "ltr"}
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 13,
            lineHeight: rtl ? 1.9 : 1.75,
            color: "var(--text-secondary)",
            textAlign: rtl ? "right" : "left",
            margin: "6px 0 0",
            whiteSpace: "pre-wrap",
            maxHeight: open ? "none" : 96,
            overflow: "hidden",
          }}
        >
          {postText || T.noPostYet[lang]}
        </p>
        {postText.length > 160 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              minHeight: 44,
              cursor: "pointer",
              fontFamily: "var(--ff-ui)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--act)",
            }}
          >
            {open ? T.readLess[lang] : T.readAll[lang]}
          </button>
        )}
      </div>
    </div>
  );
};

export default ZonePiece;