import React from "react";
import Masthead from "./Masthead";
import PressFooter from "./PressFooter";
import { PAPER, INK, INK2, SPOT, RULE, SERIF, MONO, ARABIC } from "./pressTokens";
import type { QASheetDoc } from "./onepagerTypes";
import { getPublication, type PublicationConfig } from "@/lib/publication";

export interface QASheetPageProps {
  doc: QASheetDoc;
  authorName?: string;
  authorTitle?: string;
  publication?: PublicationConfig;
  w?: number;
  h?: number;
  renderHeadlineWithAccent: (
    headline: string,
    accent: string | undefined,
    fg: string,
    accentColor: string,
    italic?: boolean,
  ) => React.ReactNode;
  wrapText: (text: string, maxCharsPerLine: number) => string[];
}

function PaperGrain({ w, h, id }: { w: number; h: number; id: string }) {
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id={id} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.5" fill={INK} fillOpacity="0.045" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} />
    </g>
  );
}

export default function QASheetPage({
  doc, authorName = "Your Name", authorTitle = "", publication, w = 1080, h = 1350,
  renderHeadlineWithAccent, wrapText,
}: QASheetPageProps) {
  const rtl = doc.lang === "ar";
  const edgePad = rtl ? 96 : 68;
  const textW = w - edgePad * 2;
  const leftX = rtl ? w - edgePad : edgePad;
  const anchor: "start" | "end" = rtl ? "end" : "start";
  const HEAD = rtl ? ARABIC : SERIF;
  const first = (authorName || "").split(/\s+/)[0] || "";
  const pub = getPublication(
    { identity_intelligence: { publication } as any },
    rtl ? "ar" : "en",
    first,
  );
  const nameplate: { name: string; style: "classic" | "monogram" | "arabic"; monogramChar?: string } = {
    name: pub.name,
    style: pub.style,
    monogramChar: pub.monogram_char,
  };
  const topLeft = rtl ? "أسئلة وأجوبة" : "QUESTIONS & ANSWERS";
  const topRight = doc.source_line || (rtl ? "من صندوق البريد" : "FROM MY INBOX");
  const editionLabel = rtl ? "س و ج" : "Q & A";
  const kicker = rtl ? "سألتموني.. وأجبت" : "ASKED AND ANSWERED";
  const grainId = "qa-grain";

  const contentY = 220;
  const topicLines = wrapText(doc.topic_headline, rtl ? 20 : 26);
  const topicLineH = 72;
  const topicEndY = contentY + (topicLines.length - 1) * topicLineH;

  // Items area
  const itemsTop = topicEndY + 90;
  const closingRuleReserve = 200; // reserved for closing block
  const items = doc.items.slice(0, 5);
  const availH = h - itemsTop - closingRuleReserve;
  const rowH = Math.max(150, Math.floor(availH / Math.max(items.length, 1)));

  const closingY = itemsTop + items.length * rowH + 40;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg"
         style={{ width: "100%", height: "100%", display: "block", unicodeBidi: "plaintext" as any }}>
      <defs>{rtl && <style>{`text, tspan { unicode-bidi: plaintext; }`}</style>}</defs>
      <rect width={w} height={h} fill={PAPER} />
      <PaperGrain w={w} h={h} id={grainId} />
      <Masthead w={w} variant="full" nameplate={nameplate}
        topLeft={topLeft} topRight={topRight}
        editionLabel={editionLabel} kicker={kicker} rtl={rtl} />

      {topicLines.map((ln, i) => (
        <text key={i} x={leftX} y={contentY + i * topicLineH} textAnchor={anchor}
              fontFamily={HEAD} fontWeight={rtl ? 800 : 500} fontSize={60} fill={INK}
              style={rtl ? undefined : { letterSpacing: "-0.01em" }}>
          {renderHeadlineWithAccent(ln, doc.headline_accent, INK, SPOT, true)}
        </text>
      ))}

      {items.map((it, i) => {
        const y = itemsTop + i * rowH;
        const numLabel = String(i + 1).padStart(2, "0");
        const numX = rtl ? w - edgePad : edgePad;
        const bodyX = rtl ? w - edgePad - 76 : edgePad + 76;
        const qLines = wrapText(it.q, rtl ? 24 : 34).slice(0, 2);
        const aLines = wrapText(it.a, rtl ? 34 : 48).slice(0, 3);
        const qStart = y + 46;
        const qLineH = 42;
        const aStart = qStart + qLines.length * qLineH + 12;
        return (
          <g key={i}>
            <line x1={edgePad} x2={w - edgePad} y1={y} y2={y} stroke={RULE} strokeWidth={1} />
            <text x={numX} y={y + 46} textAnchor={anchor}
                  fontFamily={MONO} fontSize={22} fill={SPOT}
                  direction="ltr" style={{ unicodeBidi: "isolate" as any }}>
              {numLabel}
            </text>
            {qLines.map((ln, li) => (
              <text key={`q${li}`} x={bodyX} y={qStart + li * qLineH} textAnchor={anchor}
                    fontFamily={HEAD} fontWeight={rtl ? 800 : 600} fontSize={31} fill={INK}>
                {ln}
              </text>
            ))}
            {aLines.map((ln, li) => (
              <text key={`a${li}`} x={bodyX} y={aStart + li * 34} textAnchor={anchor}
                    fontFamily={rtl ? ARABIC : SERIF}
                    fontWeight={rtl ? 600 : 400}
                    fontSize={25} fill={INK2}>
                {ln}
              </text>
            ))}
          </g>
        );
      })}

      {/* Closing */}
      <line x1={edgePad} x2={w - edgePad} y1={closingY} y2={closingY} stroke={INK} strokeWidth={3} />
      {(() => {
        const invite = doc.invite || "";
        const dashIdx = invite.lastIndexOf(" — ");
        const hasDash = dashIdx > -1;
        const head = hasDash ? invite.slice(0, dashIdx) : invite;
        const tail = hasDash ? invite.slice(dashIdx + 3) : "";
        const headLines = wrapText(head, rtl ? 34 : 48).slice(0, 3);
        const startY = closingY + 46;
        return (
          <g>
            {headLines.map((ln, i) => (
              <text key={i} x={leftX} y={startY + i * 36} textAnchor={anchor}
                    fontFamily={rtl ? ARABIC : SERIF}
                    fontStyle={rtl ? "normal" : "italic"}
                    fontWeight={rtl ? 600 : 400}
                    fontSize={27} fill={INK2}>
                {ln}
                {i === headLines.length - 1 && tail ? (
                  <tspan fontWeight={rtl ? 800 : 600} fill={SPOT}
                         fontStyle={rtl ? "normal" : "italic"}>
                    {` — ${tail}`}
                  </tspan>
                ) : null}
              </text>
            ))}
            <text x={rtl ? edgePad : w - edgePad}
                  y={startY}
                  textAnchor={rtl ? "start" : "end"}
                  fontFamily={MONO} fontSize={18} letterSpacing={2} fill={SPOT}
                  direction="ltr" style={{ unicodeBidi: "isolate" as any }}>
              {`Nº 0${items.length + 1} →`}
            </text>
          </g>
        );
      })()}

      <PressFooter
        w={w} h={h}
        authorName={authorName || (rtl ? "اسمك" : "Your Name")}
        authorTitle={authorTitle || ""}
        rtl={rtl}
        mode="rule"
      />
    </svg>
  );
}