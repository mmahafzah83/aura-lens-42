import React from "react";
import { ButtonGhost, ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, Muted, TextLink } from "./ui";

interface Props {
  lang: Lang;
  writeLang: Lang;
  content: string;
  onContentChange: (v: string) => void;
  busy: null | "post" | "save";
  notice: string | null;
  publishDisabled: boolean;
  onSwitchLanguage: () => void;
  onPost: () => void;
  onSave: () => void;
  onBack: () => void;
}

const MAX = 3000;

/** Model A — the member is the editor-in-chief. One post, directly editable. */
const StepReview: React.FC<Props> = ({
  lang, writeLang, content, onContentChange, busy, notice, publishDisabled,
  onSwitchLanguage, onPost, onSave, onBack,
}) => {
  const rtl = writeLang === "ar";
  const over = content.length > MAX;

  return (
    <div>
      <Heading>{S.s5Head[lang]}</Heading>
      <Helper>{S.s5Help[lang]}</Helper>

      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        dir={rtl ? "rtl" : "ltr"}
        spellCheck={false}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginTop: 20,
          minHeight: 260,
          resize: "vertical",
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: 14,
          boxShadow: "var(--shadow-card)",
          padding: 20,
          outline: "none",
          fontFamily: "var(--ff-ui)",
          fontSize: 15,
          lineHeight: rtl ? 1.9 : 1.75,
          color: "var(--text-primary)",
          textAlign: rtl ? "right" : "left",
        }}
      />

      <div style={{ marginTop: 8 }}>
        <span
          style={{
            fontFamily: "var(--ff-mono)",
            fontSize: 12,
            color: over ? "var(--error)" : "var(--text-muted)",
          }}
        >
          {content.length.toLocaleString("en-US")} / 3,000
        </span>
      </div>

      <div style={{ marginTop: 16 }}>
        <TextLink onClick={onSwitchLanguage}>
          {writeLang === "ar" ? S.s5SwitchEn[lang] : S.s5SwitchAr[lang]}
        </TextLink>{" "}
        <Muted>{S.s5SwitchNote[lang]}</Muted>
      </div>

      {notice && (
        <p
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 13.5,
            lineHeight: 1.8,
            color: "var(--text-secondary)",
            margin: "16px 0 0",
          }}
        >
          {notice}
        </p>
      )}

      {busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <style>{"@keyframes composeSpin{to{transform:rotate(360deg)}}"}</style>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              border: "2px solid var(--machine)",
              borderTopColor: "transparent",
              display: "inline-block",
              animation: "composeSpin 0.8s linear infinite",
            }}
          />
          <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: 600, color: "var(--machine-text)" }}>
            {busy === "post" ? S.s5Posting[lang] : S.s5Saving[lang]}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
        <ButtonPrimary onClick={onPost} disabled={busy !== null || publishDisabled}>
          {S.s5Post[lang]}
        </ButtonPrimary>
        <ButtonGhost onClick={onSave} disabled={busy !== null}>
          {S.s5Save[lang]}
        </ButtonGhost>
        <TextLink onClick={onBack}>{S.back[lang]}</TextLink>
      </div>
    </div>
  );
};

export default StepReview;
