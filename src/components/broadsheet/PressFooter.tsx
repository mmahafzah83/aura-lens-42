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
  const rightX = rtl ? edgePad : w - edgePad;
  const leftAnchor = rtl ? "end" : "start";
  const rightAnchor = rtl ? "start" : "end";

  const arabicName = isArabicName(authorName);
  const title = (authorTitle || "").slice(0, 35);
  const fullByline = title ? `${authorName} · ${title}` : authorName;

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
        fontFamily={arabicName ? ARABIC : MONO}
        fontWeight={arabicName ? 700 : 600}
        fontSize={arabicName ? 22 : 18}
        letterSpacing={arabicName ? undefined : 2.5}
        fill={INK}
        style={arabicName ? undefined : { textTransform: "uppercase" }}
      >
        {arabicName ? authorName : authorName.toUpperCase()}
        {title ? (
          <tspan
            fontFamily={arabicName ? ARABIC : MONO}
            fontWeight={400}
            fill={INK2}
            style={arabicName ? undefined : { textTransform: "none" }}
          >
            {` · ${title}`}
          </tspan>
        ) : null}
      </text>

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
    </g>
  );
}