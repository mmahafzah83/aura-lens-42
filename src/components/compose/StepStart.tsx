import React from "react";
import { ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, Muted, card } from "./ui";

const StepStart: React.FC<{ lang: Lang; onContinue: () => void; align: "left" | "right" }> = ({
  lang,
  onContinue,
  align,
}) => (
  <div>
    <Heading>{S.s1Head[lang]}</Heading>
    <Helper>{S.s1Help[lang]}</Helper>

    <div style={{ ...card, marginTop: 20, borderColor: "var(--act)", textAlign: align }}>
      <div style={{ fontFamily: "var(--ff-ui)", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
        {S.s1CardTitle[lang]}
      </div>
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)", margin: "8px 0 12px" }}>
        {S.s1CardSub[lang]}
      </p>
      <Muted>{S.s1Time[lang]}</Muted>
    </div>

    <p style={{ marginTop: 14 }}>
      <Muted>{S.s1More[lang]}</Muted>
    </p>

    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
      <ButtonPrimary onClick={onContinue}>{S.continue[lang]}</ButtonPrimary>
      <Muted>{S.nothingYet[lang]}</Muted>
    </div>
  </div>
);

export default StepStart;