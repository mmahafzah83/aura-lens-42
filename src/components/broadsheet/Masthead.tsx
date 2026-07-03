import React from "react";
import { INK, INK2, SPOT, RULE_SOFT, SERIF, MONO, ARABIC } from "./pressTokens";

export const MASTHEAD_CONTENT_Y = { full: 200, slim: 164 } as const;

export interface MastheadProps {
  w: number;
  variant: "full" | "slim";
  nameplate: {
    name: string;
    style: "classic" | "monogram" | "arabic";
    monogramChar?: string;
  };
  topLeft?: string;
  topRight?: string;
  editionLabel: string;
  kicker?: string;
  rtl: boolean;
}

export default function Masthead({
  w,
  variant,
  nameplate,
  topLeft,
  topRight,
  editionLabel,
  kicker,
  rtl,
}: MastheadProps) {
  const edgePad = rtl ? 96 : 68;
  const leftX = rtl ? w - edgePad : edgePad;
  const rightX = rtl ? edgePad : w - edgePad;
  const leftAnchor = rtl ? "end" : "start";
  const rightAnchor = rtl ? "start" : "end";

  if (variant === "slim") {
    return (
      <g>
        <line x1={edgePad} x2={w - edgePad} y1={60} y2={60} stroke={INK} strokeWidth={3} />
        <text
          x={leftX}
          y={88}
          textAnchor={leftAnchor}
          fontFamily={nameplate.style === "arabic" ? ARABIC : SERIF}
          fontWeight={nameplate.style === "arabic" ? 800 : 600}
          fontSize={nameplate.style === "arabic" ? 26 : 24}
          fill={INK}
        >
          {nameplate.name}
        </text>
        <text
          x={rightX}
          y={88}
          textAnchor={rightAnchor}
          fontFamily={MONO}
          fontSize={18}
          letterSpacing={2.5}
          fill={SPOT}
        >
          {editionLabel}
        </text>
        <line x1={edgePad} x2={w - edgePad} y1={100} y2={100} stroke={INK} strokeWidth={2} />
        {kicker ? (
          <text
            x={leftX}
            y={140}
            textAnchor={leftAnchor}
            fontFamily={rtl ? ARABIC : MONO}
            fontWeight={rtl ? 700 : 400}
            fontSize={rtl ? 22 : 20}
            letterSpacing={rtl ? undefined : 4}
            fill={SPOT}
            style={rtl ? undefined : { textTransform: "uppercase" }}
          >
            {rtl ? kicker : kicker.toUpperCase()}
          </text>
        ) : null}
      </g>
    );
  }

  // full variant
  return (
    <g>
      {topLeft ? (
        <text
          x={leftX}
          y={64}
          textAnchor={leftAnchor}
          fontFamily={MONO}
          fontSize={18}
          letterSpacing={3}
          fill={INK2}
          style={{ textTransform: "uppercase" }}
        >
          {topLeft.toUpperCase()}
        </text>
      ) : null}
      {topRight ? (
        <text
          x={rightX}
          y={64}
          textAnchor={rightAnchor}
          fontFamily={MONO}
          fontSize={18}
          letterSpacing={3}
          fill={INK2}
          style={{ textTransform: "uppercase" }}
        >
          {topRight.toUpperCase()}
        </text>
      ) : null}
      <line x1={edgePad} x2={w - edgePad} y1={78} y2={78} stroke={INK} strokeWidth={5} />

      {nameplate.style === "monogram" ? (
        <>
          <rect
            x={rtl ? w - edgePad - 60 : edgePad}
            y={68}
            width={60}
            height={60}
            fill="none"
            stroke={INK}
            strokeWidth={1.5}
          />
          <text
            x={(rtl ? w - edgePad - 60 : edgePad) + 30}
            y={118}
            textAnchor="middle"
            fontFamily={SERIF}
            fontStyle="italic"
            fontWeight={600}
            fontSize={34}
            fill={INK}
          >
            {nameplate.monogramChar || nameplate.name.charAt(0)}
          </text>
          <text
            x={rtl ? w - edgePad - 72 : edgePad + 72}
            y={118}
            textAnchor={leftAnchor}
            fontFamily={SERIF}
            fontWeight={600}
            fontSize={30}
            fill={INK}
          >
            {nameplate.name}
          </text>
        </>
      ) : nameplate.style === "arabic" ? (
        <text
          x={leftX}
          y={118}
          textAnchor={leftAnchor}
          fontFamily={ARABIC}
          fontWeight={800}
          fontSize={38}
          fill={INK}
        >
          {nameplate.name}
        </text>
      ) : (
        <text
          x={leftX}
          y={118}
          textAnchor={leftAnchor}
          fontFamily={SERIF}
          fontWeight={600}
          fontSize={34}
          fill={INK}
          style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          {nameplate.name.toUpperCase()}
        </text>
      )}

      <text
        x={rightX}
        y={118}
        textAnchor={rightAnchor}
        fontFamily={MONO}
        fontSize={18}
        letterSpacing={2.5}
        fill={SPOT}
      >
        {editionLabel}
      </text>
      <line x1={edgePad} x2={w - edgePad} y1={132} y2={132} stroke={INK} strokeWidth={2} />

      {kicker ? (
        <>
          <text
            x={leftX}
            y={176}
            textAnchor={leftAnchor}
            fontFamily={rtl ? ARABIC : MONO}
            fontWeight={rtl ? 700 : 400}
            fontSize={rtl ? 22 : 20}
            letterSpacing={rtl ? undefined : 4}
            fill={SPOT}
            style={rtl ? undefined : { textTransform: "uppercase" }}
          >
            {rtl ? kicker : kicker.toUpperCase()}
          </text>
          {/* Hairline from text end to far pad — approximate width via char count */}
          <line
            x1={rtl ? edgePad : edgePad + Math.min(kicker.length * 12 + 20, w - edgePad * 2 - 40)}
            x2={rtl ? w - edgePad - Math.min(kicker.length * 14 + 20, w - edgePad * 2 - 40) : w - edgePad}
            y1={172}
            y2={172}
            stroke={RULE_SOFT}
            strokeWidth={1}
          />
        </>
      ) : null}
    </g>
  );
}