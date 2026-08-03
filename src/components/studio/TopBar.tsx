import React from "react";
import { Link } from "react-router-dom";
import { Avatar, Chip } from "@/components/systemb";
import { T, postureLabel, type Lang, type Posture } from "./strings";

/** Plain-text navigation only. No icons anywhere in this bar. */
const linkStyle: React.CSSProperties = {
  fontFamily: "var(--ff-ui)",
  fontSize: 13.5,
  color: "var(--text-secondary)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "0 4px",
};

export const TopBar: React.FC<{
  lang: Lang;
  posture: Posture;
  firstName: string;
  avatarUrl: string | null;
  onChangePosture: () => void;
}> = ({ lang, posture, firstName, avatarUrl, onChangePosture }) => (
  <header
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
      padding: "6px 0 12px",
      borderBottom: "1px solid var(--border-default)",
    }}
  >
    <nav style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: "var(--ff-ui)",
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--text-primary)",
        }}
      >
        {T.wordmark[lang]}
      </span>
      <Link to="/home" style={linkStyle}>{T.navHome[lang]}</Link>
      <Link to="/home?tab=library" style={linkStyle}>{T.navPieces[lang]}</Link>
      <Link to="/guide/thought-leadership-strategy" style={linkStyle}>{T.navHow[lang]}</Link>
      <Link to="/guide" style={linkStyle}>{T.navGuides[lang]}</Link>
    </nav>

    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={onChangePosture}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          minHeight: 44,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <Chip variant="cooling">
          {T.workingAs[lang]}: {postureLabel(posture, lang)} · {T.change[lang]}
        </Chip>
      </button>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Avatar src={avatarUrl} name={firstName} size="sm" />
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-primary)" }}>
          {firstName}
        </span>
      </span>
    </div>
  </header>
);

export default TopBar;