import React from "react";
import { ButtonGhost, ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, card } from "./ui";

interface Props {
  lang: Lang;
  variant: "posted" | "saved";
  postUrl?: string | null;
  onAnother: () => void;
  onHome: () => void;
}

const StepDone: React.FC<Props> = ({ lang, variant, postUrl, onAnother, onHome }) => (
  <div>
    <Heading>{variant === "posted" ? S.s6PostedHead[lang] : S.s6SavedHead[lang]}</Heading>
    <Helper>{variant === "posted" ? S.s6PostedHelp[lang] : S.s6SavedHelp[lang]}</Helper>

    {variant === "posted" && postUrl && (
      <p style={{ marginTop: 14 }}>
        <a
          href={postUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: 600, color: "var(--act)" }}
        >
          {S.s6SeeIt[lang]}
        </a>
      </p>
    )}

    <div style={{ ...card, marginTop: 20, background: "var(--surface-subtle)" }}>
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", margin: 0 }}>
        {S.s6Next[lang]}
      </p>
    </div>

    <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
      <ButtonPrimary onClick={onAnother}>{S.s6Another[lang]}</ButtonPrimary>
      <ButtonGhost onClick={onHome}>{S.s6Home[lang]}</ButtonGhost>
    </div>
  </div>
);

export default StepDone;