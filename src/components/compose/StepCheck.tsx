import React from "react";
import { ButtonPrimary } from "@/components/systemb";
import { S, type Lang } from "./strings";
import { Heading, Helper, LangToggle, Muted, TextLink, card } from "./ui";

interface Props {
  lang: Lang;
  align: "left" | "right";
  loading: boolean;
  title: string;
  explanation: string;
  meaning: string;
  writeLang: Lang;
  onWriteLang: (l: Lang) => void;
  onBack: () => void;
  onNext: () => void;
}

const Para: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div style={{ marginTop: 14 }}>
    <div
      style={{
        fontFamily: "var(--ff-mono)",
        fontSize: 10.5,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", margin: 0 }}>
      {children}
    </p>
  </div>
);

const StepCheck: React.FC<Props> = ({
  lang, align, loading, title, explanation, meaning, writeLang, onWriteLang, onBack, onNext,
}) => (
  <div>
    <Heading>{S.s3Head[lang]}</Heading>
    <Helper>{S.s3Help[lang]}</Helper>

    <div style={{ ...card, marginTop: 20, textAlign: align }}>
      <div style={{ fontFamily: "var(--ff-ui)", fontSize: 17, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5 }}>
        {loading ? S.loading[lang] : title}
      </div>
      {explanation && <Para label={S.s3WhatItIs[lang]}>{explanation}</Para>}
      {meaning && <Para label={S.s3WhyMatters[lang]}>{meaning}</Para>}
      <div style={{ marginTop: 16 }}>
        <Muted>{S.s3IsArgument[lang]}</Muted>
      </div>
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-primary)", fontWeight: 600 }}>
        {S.s3WriteIn[lang]}
      </span>
      <LangToggle lang={writeLang} onChange={onWriteLang} />
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, flexWrap: "wrap" }}>
      <ButtonPrimary onClick={onNext}>{S.s3Go[lang]}</ButtonPrimary>
      <TextLink onClick={onBack}>{S.back[lang]}</TextLink>
      <Muted>{S.s3Cost[lang]}</Muted>
    </div>
  </div>
);

export default StepCheck;