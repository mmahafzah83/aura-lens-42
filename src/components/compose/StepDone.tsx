import React, { useState } from "react";
import { ButtonGhost, ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, TextLink, card } from "./ui";

interface Props {
  lang: Lang;
  variant: "posted" | "saved";
  postUrl?: string | null;
  onAnother: () => void;
  onHome: () => void;
}

const SuccessMark: React.FC<{ tone: string }> = ({ tone }) => (
  <span
    aria-hidden
    style={{
      width: 44,
      height: 44,
      borderRadius: 999,
      border: `2px solid ${tone}`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    }}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </span>
);

const StepDone: React.FC<Props> = ({ lang, variant, postUrl, onAnother, onHome }) => {
  const [copied, setCopied] = useState(false);
  const posted = variant === "posted";

  const copy = async () => {
    if (!postUrl) return;
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the link is still visible above */
    }
  };

  return (
    <div>
      <SuccessMark tone={posted ? "var(--success)" : "var(--act)"} />
      <Heading>{posted ? S.s6PostedHead[lang] : S.s6SavedHead[lang]}</Heading>
      <Helper>{posted ? S.s6PostedHelp[lang] : S.s6SavedHelp[lang]}</Helper>

      {posted && (
        <div style={{ ...card, marginTop: 20, background: "var(--surface-subtle)" }}>
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", margin: 0 }}>
            {S.s6Next[lang]}
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
        {posted && postUrl && (
          <>
            <ButtonPrimary onClick={() => window.open(postUrl, "_blank", "noopener")}>
              {S.s6SeeIt[lang]}
            </ButtonPrimary>
            <ButtonGhost onClick={copy}>{copied ? S.s6Copied[lang] : S.s6CopyLink[lang]}</ButtonGhost>
            <ButtonGhost onClick={onAnother}>{S.s6Another[lang]}</ButtonGhost>
          </>
        )}
        {(!posted || !postUrl) && <ButtonPrimary onClick={onAnother}>{S.s6Another[lang]}</ButtonPrimary>}
        <TextLink onClick={onHome}>{S.s6Home[lang]}</TextLink>
      </div>
    </div>
  );
};

export default StepDone;