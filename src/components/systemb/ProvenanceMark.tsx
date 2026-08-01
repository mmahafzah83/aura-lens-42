import React from "react";
import {
  PROVENANCE_EXPLAIN,
  PROVENANCE_LABEL,
  provenanceOf,
  type Provenance,
  type ProvenanceRow,
} from "@/lib/postProvenance";

/**
 * ProvenanceMark — the one visible answer to "did Aura make this?".
 *
 * Blue tint when Aura sent it (the thing the product exists to produce),
 * neutral tint when Aura wrote it and the member posted it elsewhere, and
 * a bare faint line when LinkedIn's sync simply found it. The last one must
 * recede: it is not Aura's work and is never dressed up as though it were.
 */

const STYLES: Record<Provenance, React.CSSProperties> = {
  aura_published: {
    background: "var(--act-tint)",
    color: "var(--act)",
    border: "1px solid color-mix(in srgb, var(--act) 22%, transparent)",
  },
  aura_drafted: {
    background: "var(--surface-subtle)",
    color: "var(--text-secondary)",
    border: "1px solid var(--rule-divider)",
  },
  linkedin_only: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid transparent",
    paddingInline: 0,
  },
};

interface Props {
  /** A post row, or an explicit provenance value. */
  post?: ProvenanceRow | null;
  value?: Provenance | null;
  style?: React.CSSProperties;
}

const ProvenanceMark: React.FC<Props> = ({ post, value, style }) => {
  const v = value ?? provenanceOf(post);
  if (!v) return null;
  return (
    <span
      title={PROVENANCE_EXPLAIN[v]}
      aria-label={`${PROVENANCE_LABEL[v]}. ${PROVENANCE_EXPLAIN[v]}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 6,
        padding: "2px 6px",
        fontFamily: "var(--ff-mono)",
        fontSize: 9.5,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...STYLES[v],
        ...style,
      }}
    >
      {PROVENANCE_LABEL[v]}
    </span>
  );
};

export default ProvenanceMark;
