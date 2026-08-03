import React, { useState } from "react";
import { ButtonGhost, ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, Muted, TextLink, card } from "./ui";

export interface QualityGate {
  skipped?: boolean;
  weaknesses?: string[];
  hook_replaced?: boolean;
  original_hook?: string;
}

interface Props {
  lang: Lang;
  writeLang: Lang;
  content: string;
  gate: QualityGate | null;
  busy: null | "post" | "save";
  notice: string | null;
  publishDisabled: boolean;
  onFixWeakness: (weakness: string) => void;
  onSwitchLanguage: () => void;
  onPost: () => void;
  onSave: () => void;
  onBack: () => void;
}

const MAX = 3000;

const StepReview: React.FC<Props> = ({
  lang, writeLang, content, gate, busy, notice, publishDisabled,
  onFixWeakness, onSwitchLanguage, onPost, onSave, onBack,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const rtl = writeLang === "ar";
  const over = content.length > MAX;
  const weaknesses = (gate?.weaknesses ?? []).slice(0, 2);

  return (
    <div>
      <Heading>{S.s5Head[lang]}</Heading>
      <Helper>{S.s5Help[lang]}</Helper>

      <div
        style={{ ...card, marginTop: 20 }}
        dir={rtl ? "rtl" : "ltr"}
      >
        <div
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 15,
            lineHeight: rtl ? 1.9 : 1.75,
            color: "var(--text-primary)",
            whiteSpace: "pre-wrap",
            textAlign: rtl ? "right" : "left",
          }}
        >
          {content}
        </div>
      </div>

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

      {gate?.hook_replaced && (
        <div style={{ marginTop: 12 }}>
          <Muted>{S.s5Hook[lang]}</Muted>{" "}
          <TextLink onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? S.s5HideOriginal[lang] : S.s5SeeOriginal[lang]}
          </TextLink>
          {showOriginal && gate.original_hook && (
            <p
              style={{
                fontFamily: "var(--ff-ui)",
                fontSize: 13.5,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                background: "var(--surface-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                padding: 12,
                marginTop: 8,
              }}
            >
              {gate.original_hook}
            </p>
          )}
        </div>
      )}

      {gate?.skipped && (
        <div style={{ ...card, marginTop: 16, background: "var(--surface-subtle)" }}>
          <div style={{ fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            {S.s5NoCheckHead[lang]}
          </div>
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.8, color: "var(--text-secondary)", margin: "8px 0 0" }}>
            {S.s5NoCheckBody[lang]}
          </p>
        </div>
      )}

      {!gate?.skipped && weaknesses.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            {S.s5Weak[lang]}
          </div>
          {weaknesses.map((w) => (
            <div
              key={w}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                padding: 12,
                marginTop: 10,
                background: "var(--surface-card)",
              }}
            >
              <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)", flex: 1 }}>
                {w}
              </span>
              <ButtonGhost onClick={() => onFixWeakness(w)}>{S.s5Fix[lang]}</ButtonGhost>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 13.5,
            lineHeight: 1.8,
            color: "var(--text-primary)",
            background: "var(--surface-subtle)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: 12,
            marginTop: 16,
          }}
        >
          {notice}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <TextLink onClick={onSwitchLanguage}>
          {writeLang === "ar" ? S.s5SwitchEn[lang] : S.s5SwitchAr[lang]}
        </TextLink>{" "}
        <Muted>{S.s5SwitchNote[lang]}</Muted>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
        {!publishDisabled && (
          <ButtonPrimary onClick={onPost} disabled={busy !== null}>
            {busy === "post" ? S.s5Posting[lang] : S.s5Post[lang]}
          </ButtonPrimary>
        )}
        <ButtonGhost onClick={onSave} disabled={busy !== null}>
          {busy === "save" ? S.s5Saving[lang] : S.s5Save[lang]}
        </ButtonGhost>
        <TextLink onClick={onBack}>{S.back[lang]}</TextLink>
      </div>
    </div>
  );
};

export default StepReview;