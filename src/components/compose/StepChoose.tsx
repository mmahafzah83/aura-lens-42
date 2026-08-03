import React, { useState } from "react";
import { ButtonPrimary, Chip } from "@/components/systemb";
import type { StartCard } from "@/components/composer/startCards";
import { S, type Lang } from "./strings";
import { Heading, Helper, Muted, SelectRow, TextLink, card } from "./ui";

export interface ChoiceRow {
  id: string;
  title: string;
  reason: string;
  insight: string;
  fragmentCount: number;
}

export const fromStartCard = (c: StartCard): ChoiceRow => ({
  id: c.signalId,
  title: c.title,
  reason: c.reason,
  insight: c.insight,
  fragmentCount: c.fragmentCount,
});

interface Props {
  lang: Lang;
  align: "left" | "right";
  loading: boolean;
  rows: ChoiceRow[];
  totalSignals: number;
  showingAll: boolean;
  onSeeAll: () => void;
  selectedId: string | null;
  onSelect: (row: ChoiceRow) => void;
  typedTopic: string;
  onTypedTopic: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  onGoCapture: () => void;
}

const StepChoose: React.FC<Props> = ({
  lang, align, loading, rows, totalSignals, showingAll, onSeeAll,
  selectedId, onSelect, typedTopic, onTypedTopic, onBack, onNext, onGoCapture,
}) => {
  const [freeOpen, setFreeOpen] = useState(!!typedTopic);
  const empty = !loading && rows.length === 0 && totalSignals === 0;

  return (
    <div>
      <Heading>{S.s2Head[lang]}</Heading>
      <Helper>{S.s2Help[lang]}</Helper>

      {loading && (
        <p style={{ marginTop: 20 }}>
          <Muted size={14}>{S.loading[lang]}</Muted>
        </p>
      )}

      {empty && (
        <div style={{ ...card, marginTop: 20, textAlign: align }}>
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", margin: "0 0 14px" }}>
            {S.s2Empty[lang]}
          </p>
          <ButtonPrimary onClick={onGoCapture}>{S.s2GoCapture[lang]}</ButtonPrimary>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {rows.map((r) => (
            <SelectRow key={r.id} align={align} selected={selectedId === r.id} onClick={() => onSelect(r)}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5 }}>{r.title}</div>
              {r.reason && (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginTop: 6 }}>{r.reason}</div>
              )}
              <div style={{ marginTop: 10 }}>
                <Chip variant="cooling">
                  <span style={{ fontFamily: "var(--ff-mono)" }}>{r.fragmentCount}</span>&nbsp;{S.sources[lang]}
                </Chip>
              </div>
            </SelectRow>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
        {!showingAll && <TextLink onClick={onSeeAll}>{S.s2SeeAll[lang]}</TextLink>}
        <TextLink onClick={() => setFreeOpen(true)}>{S.s2Other[lang]}</TextLink>
      </div>

      {freeOpen && (
        <input
          value={typedTopic}
          onChange={(e) => onTypedTopic(e.target.value)}
          placeholder={S.s2OtherPlaceholder[lang]}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--surface-card)",
            color: "var(--text-primary)",
            fontFamily: "var(--ff-ui)",
            fontSize: 14,
            textAlign: align,
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, flexWrap: "wrap" }}>
        <ButtonPrimary disabled={!selectedId && !typedTopic.trim()} onClick={onNext}>
          {S.s2Use[lang]}
        </ButtonPrimary>
        <TextLink onClick={onBack}>{S.back[lang]}</TextLink>
        <Muted>{S.s2Still[lang]}</Muted>
      </div>
    </div>
  );
};

export default StepChoose;