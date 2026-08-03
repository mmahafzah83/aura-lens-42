import React, { useEffect, useState } from "react";
import { ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, TextLink, card } from "./ui";

interface Props {
  lang: Lang;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}

const StepWrite: React.FC<Props> = ({ lang, error, onRetry, onBack }) => {
  const lines = S.s4Lines[lang];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (error) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % lines.length), 4000);
    return () => window.clearInterval(id);
  }, [error, lines.length]);

  if (error) {
    return (
      <div>
        <Heading>{S.s4Error[lang]}</Heading>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
          <ButtonPrimary onClick={onRetry}>{S.tryAgain[lang]}</ButtonPrimary>
          <TextLink onClick={onBack}>{S.back[lang]}</TextLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Heading>{S.s4Head[lang]}</Heading>
      <div style={{ ...card, marginTop: 20, borderColor: "var(--machine)", background: "var(--machine-tint)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: "var(--machine)",
              animation: "pulse 1.6s ease-in-out infinite",
            }}
          />
          <span style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--machine-text)" }}>
            {lines[i]}
          </span>
        </div>
      </div>
      <Helper>{S.s4Help[lang]}</Helper>
    </div>
  );
};

export default StepWrite;