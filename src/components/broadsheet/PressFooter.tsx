import React from "react";
import PageRail from "./PageRail";
import { INK, INK2, SPOT, MONO, ARABIC } from "./pressTokens";

export interface PressFooterProps {
  w: number;
  h: number;
  authorName: string;
  authorTitle?: string;
  rtl: boolean;
  mode: "rail" | "rule";
  current?: number;
  total?: number;
}

function isArabicName(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

export default function PressFooter({
  w,
  h,
  authorName,
  authorTitle,
  rtl,
  mode,
  current,
  total,
}: PressFooterProps) {
  const edgePad = 68;
  const bylineY = h - 88;
  const leftX = rtl ? w - edgePad : edgePad;
  const rightX = rtl ? edgePad + 30 : w - edgePad - 30;
  // Aura mark (see src/components/brand/AuraLogo.tsx) — rendered as an inline
  // radiant-dial mark, ~18px, single color SPOT, centered on the byline.
  const markSize = 18;
  const markCX = rtl ? edgePad + markSize / 2 : w - edgePad - markSize / 2;
  const markCY = bylineY - 8;
  const markX = markCX - markSize / 2;
  const markY = markCY - markSize / 2;
  const leftAnchor = rtl ? "end" : "start";
  const rightAnchor = rtl ? "start" : "end";

  const arabicName = isArabicName(authorName);
  const title = (authorTitle || "").slice(0, 35);
  const arabicTitle = isArabicName(title);

  return (
    <g>
      {mode === "rail" && typeof current === "number" && typeof total === "number" ? (
        <PageRail w={w} h={h} current={current} total={total} rtl={rtl} />
      ) : null}
      {mode === "rule" ? (
        <line x1={edgePad} x2={w - edgePad} y1={h - 118} y2={h - 118} stroke={INK} strokeWidth={3} />
      ) : null}

      <text
        x={leftX}
        y={bylineY}
        textAnchor={leftAnchor}
        direction="ltr"
        fontFamily={arabicName ? ARABIC : MONO}
        fontWeight={arabicName ? 700 : 600}
        fontSize={arabicName ? 22 : 18}
        letterSpacing={arabicName ? undefined : 2.5}
        fill={INK}
        style={arabicName ? undefined : { textTransform: "uppercase" }}
      >
        <tspan
          direction={arabicName ? "rtl" : "ltr"}
          style={{ unicodeBidi: "isolate" as any }}
        >
          {arabicName ? authorName : authorName.toUpperCase()}
        </tspan>
        {title ? (
          <tspan
            direction={arabicTitle ? "rtl" : "ltr"}
            fontFamily={arabicTitle ? ARABIC : MONO}
            fontWeight={400}
            fill={INK2}
            style={{ unicodeBidi: "isolate" as any, textTransform: arabicTitle ? undefined : "none" }}
          >
            {` · ${title}`}
          </tspan>
        ) : null}
      </text>

      {/* Aura radiant-dial mark — simplified 12-ray version of AuraLogo. */}
      <svg x={markX} y={markY} width={markSize} height={markSize} viewBox="0 0 64 64" overflow="visible">
        <g stroke={SPOT} fill={SPOT} strokeLinecap="round">
          <line x1="32" y1="18.89" x2="32" y2="8.77" strokeWidth="1.6" />
          <line x1="39.09" y1="20.97" x2="44.56" y2="12.45" strokeWidth="1.6" />
          <line x1="43.92" y1="26.56" x2="53.13" y2="22.35" strokeWidth="1.6" />
          <line x1="44.97" y1="33.87" x2="55" y2="35.31" strokeWidth="1.6" />
          <line x1="41.91" y1="40.58" x2="49.56" y2="47.22" strokeWidth="1.6" />
          <line x1="35.69" y1="44.58" x2="38.55" y2="54.29" strokeWidth="1.6" />
          <line x1="28.31" y1="44.58" x2="25.45" y2="54.29" strokeWidth="1.6" />
          <line x1="22.09" y1="40.58" x2="14.44" y2="47.22" strokeWidth="1.6" />
          <line x1="19.03" y1="33.87" x2="9" y2="35.31" strokeWidth="1.6" />
          <line x1="20.08" y1="26.56" x2="10.87" y2="22.35" strokeWidth="1.6" />
          <line x1="24.91" y1="20.97" x2="19.44" y2="12.45" strokeWidth="1.6" />
          <circle cx="32" cy="32" r="6.85" stroke="none" />
        </g>
      </svg>
      <text
        x={rightX}
        y={bylineY}
        textAnchor={rightAnchor}
        fontFamily={MONO}
        fontSize={18}
        letterSpacing={2.5}
        fill={SPOT}
        direction="ltr"
        style={{ unicodeBidi: "isolate" as any }}
      >
        aura-intel.org
      </text>
      {rtl ? (
        <text
          x={rightX}
          y={bylineY + 24}
          textAnchor={rightAnchor}
          fontFamily={ARABIC}
          fontSize={12}
          fontWeight={600}
          fill={INK2}
        >
          حوّل خبرتك إلى حضور
        </text>
      ) : (
        <text
          x={rightX}
          y={bylineY + 24}
          textAnchor={rightAnchor}
          fontFamily={MONO}
          fontSize={12}
          letterSpacing={1.5}
          fill={INK2}
        >
          Turns your expertise into presence
        </text>
      )}
    </g>
  );
}