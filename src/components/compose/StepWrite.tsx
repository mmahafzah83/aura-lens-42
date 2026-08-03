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
  const [pct, setPct] = useState(4);

  useEffect(() => {
    if (error) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % lines.length), 4000);
    return () => window.clearInterval(id);
  }, [error, lines.length]);

  // Real movement: ~92% over about 20 seconds, then hold.
  useEffect(() => {
    if (error) return;
    const stepMs = 250;
    const id = window.setInterval(() => {
      setPct((v) => (v >= 92 ? 92 : Math.min(92, v + (92 - 4) / (20000 / stepMs))));
    }, stepMs);
    return () => window.clearInterval(id);
  }, [error]);

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

        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            marginTop: 14,
            height: 6,
            borderRadius: 999,
            background: "var(--surface-subtle)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: "var(--machine)",
              transition: "width 0.25s linear",
            }}
          />
        </div>

        {pct >= 92 && (
          <div style={{ marginTop: 10, fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--machine-text)" }}>
            {S.s4AlmostThere[lang]}
          </div>
        )}
      </div>
      <Helper>{S.s4Help[lang]}</Helper>
    </div>
  );
};

export default StepWrite;
