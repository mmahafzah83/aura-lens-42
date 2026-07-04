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
  const eyeX = rtl ? edgePad + 9 : w - edgePad - 9;
  const eyeY = bylineY - 8;
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

      <g>
        <ellipse cx={eyeX} cy={eyeY} rx={9} ry={5.6} fill="none" stroke={SPOT} strokeWidth={1.4} />
        <circle cx={eyeX} cy={eyeY} r={3.2} fill={SPOT} />
      </g>
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