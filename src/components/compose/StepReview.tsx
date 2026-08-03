import React, { useEffect, useState } from "react";
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
  deckAvailable: boolean;
  onMakeDeck: () => void;
  onSwitchLanguage: () => void;
  onPost: () => void;
  onSave: () => void;
  onBack: () => void;
}

const MAX = 3000;

const PencilIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--text-muted)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** Honest time estimate: climbs to 92% over ~15s, then holds. */
const PostingRing: React.FC = () => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    setPct(0);
    const step = 92 / (15000 / 200);
    const id = setInterval(() => setPct((p) => Math.min(92, p + step)), 200);
    return () => clearInterval(id);
  }, []);

  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-block", flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-subtle)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--machine)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 200ms linear" }}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--ff-mono)",
          fontSize: 12,
          color: "var(--machine-text)",
        }}
      >
        {Math.round(pct)}%
      </span>
    </span>
  );
};

/** Model A — the member is the editor-in-chief. One post, directly editable. */
const StepReview: React.FC<Props> = ({
  lang, writeLang, content, onContentChange, busy, notice, publishDisabled,
  deckAvailable, onMakeDeck, onSwitchLanguage, onPost, onSave, onBack,
}) => {
  const rtl = writeLang === "ar";
  const over = content.length > MAX;
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || hovered;
  const [format, setFormat] = useState<"post" | "deck">("post");

  const optionCard = (selected: boolean, disabled: boolean): React.CSSProperties => ({
    flex: "1 1 220px",
    textAlign: rtl ? "right" : "left",
    background: "var(--surface-card)",
    border: `1px solid ${selected ? "var(--act)" : "var(--border-default)"}`,
    boxShadow: selected ? "0 0 0 3px color-mix(in srgb, var(--act) 14%, transparent)" : "var(--shadow-card)",
    borderRadius: 12,
    padding: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  });

  return (
    <div>
      <Heading>{S.s5Head[lang]}</Heading>
      <Helper>{S.s5Help[lang]}</Helper>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginTop: 18,
          flexDirection: rtl ? "row-reverse" : "row",
          justifyContent: rtl ? "flex-start" : "flex-start",
        }}
        dir={rtl ? "rtl" : "ltr"}
      >
        <PencilIcon />
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)" }}>
          {S.s5EditHint[lang]}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        dir={rtl ? "rtl" : "ltr"}
        spellCheck={false}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginTop: 8,
          minHeight: 260,
          resize: "vertical",
          background: "var(--surface-card)",
          border: `1px solid ${active ? "var(--act)" : "var(--border-default)"}`,
          borderRadius: 14,
          boxShadow: focused
            ? "0 0 0 3px color-mix(in srgb, var(--act) 14%, transparent)"
            : "var(--shadow-card)",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
          padding: 20,
          outline: "none",
          fontFamily: "var(--ff-ui)",
          fontSize: 15,
          lineHeight: rtl ? 1.9 : 1.75,
          color: "var(--text-primary)",
          textAlign: rtl ? "right" : "left",
        }}
      />

      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--ff-mono)",
            fontSize: 12,
            color: over ? "var(--error)" : "var(--text-muted)",
          }}
        >
          {content.length.toLocaleString("en-US")} / 3,000
        </span>
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)" }}>
          {S.s5EditHint2[lang]}
        </span>
      </div>

      <div style={{ marginTop: 16 }}>
        <TextLink onClick={onSwitchLanguage}>
          {writeLang === "ar" ? S.s5SwitchEn[lang] : S.s5SwitchAr[lang]}
        </TextLink>{" "}
        <Muted>{S.s5SwitchNote[lang]}</Muted>
      </div>

      <div style={{ marginTop: 24 }} dir={rtl ? "rtl" : "ltr"}>
        <div style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
          {S.s5FormatHead[lang]}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <div
            role="radio"
            aria-checked={format === "post"}
            tabIndex={0}
            onClick={() => setFormat("post")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFormat("post"); }}
            style={optionCard(format === "post", false)}
          >
            <div style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {S.s5FormatPost[lang]}
            </div>
            <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)", marginTop: 4 }}>
              {S.s5FormatPostSub[lang]}
            </div>
          </div>

          <div style={{ flex: "1 1 220px" }}>
            <div
              role="radio"
              aria-checked={format === "deck"}
              aria-disabled={!deckAvailable || undefined}
              tabIndex={deckAvailable ? 0 : -1}
              onClick={() => { if (deckAvailable) setFormat("deck"); }}
              onKeyDown={(e) => { if (deckAvailable && (e.key === "Enter" || e.key === " ")) setFormat("deck"); }}
              style={optionCard(format === "deck", !deckAvailable)}
            >
              <div style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {S.s5FormatDeck[lang]}
              </div>
              <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)", marginTop: 4 }}>
                {S.s5FormatDeckSub[lang]}
              </div>
            </div>
            {!deckAvailable && (
              <div style={{ fontFamily: "var(--ff-ui)", fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)", marginTop: 8, textAlign: rtl ? "right" : "left" }}>
                {S.s5DeckNeedsSignal[lang]}
              </div>
            )}
          </div>
        </div>
      </div>

      {format === "post" && notice && (
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

      {format === "post" && busy === "post" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
          <PostingRing />
          <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: 600, color: "var(--machine-text)" }}>
            {S.s5Posting[lang]}
          </span>
        </div>
      )}

      {busy === "save" && (
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
            {S.s5Saving[lang]}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
        {format === "deck" ? (
          <ButtonPrimary onClick={onMakeDeck} disabled={busy !== null}>
            {S.s5OpenDeck[lang]}
          </ButtonPrimary>
        ) : (
          <ButtonPrimary onClick={onPost} disabled={busy !== null || publishDisabled}>
            {S.s5Post[lang]}
          </ButtonPrimary>
        )}
        <ButtonGhost onClick={onSave} disabled={busy !== null}>
          {S.s5Save[lang]}
        </ButtonGhost>
        <TextLink onClick={onBack}>{S.back[lang]}</TextLink>
      </div>
    </div>
  );
};

export default StepReview;
