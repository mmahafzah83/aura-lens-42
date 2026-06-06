import { forwardRef } from "react";
import {
  EXPORT_GOLD,
  EXPORT_URL,
  EXPORT_TAGLINE_EN,
  EXPORT_TAGLINE_AR,
  EXPORT_AR_FONT,
  EXPORT_FOOTER_SIZE_BRAND,
  EXPORT_FOOTER_SIZE_TAGLINE,
} from "@/lib/exportBrand";

/**
 * Credential surface components used by TierCeremonyModal.
 * Three concepts (A/B/C) — each renders at either 1200x628 (wide / LinkedIn OG)
 * or 1080x1080 (square / stories) for html2canvas export.
 *
 * Keep markup to: solid colors, borders, plain text. No backdrop-filter,
 * no CSS mask, no clip-path — html2canvas will choke on those.
 */

export interface CredentialData {
  tierName: string;            // "Strategist"
  fullName: string;
  role: string;                // "Director · EY"
  sector?: string;
  score: number | null;
  quote: string;
  topSignalTitle?: string | null;
  topSignalConfidence?: number; // 0..1
}

const BG = "#0c0b0a";
const GOLD = EXPORT_GOLD;
const GOLD_LINE = "rgba(212,176,86,.25)";
const TEXT = "#f0ede8";
const TEXT_MUTED = "rgba(240,237,232,.4)";
const TEXT_HINT = "rgba(240,237,232,.2)";
const SERIF = "'Cormorant Garamond', 'Cairo', Georgia, serif";
const SANS = "'DM Sans', system-ui, sans-serif";

type Size = "wide" | "square";

function dims(size: Size) {
  return size === "wide" ? { w: 1200, h: 628 } : { w: 1080, h: 1080 };
}

function Corners({ size }: { size: Size }) {
  const inset = size === "wide" ? 32 : 40;
  const s = 28;
  const style = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: s,
    height: s,
    borderColor: GOLD_LINE,
    borderStyle: "solid",
    borderWidth: 0,
    ...pos,
  });
  return (
    <>
      <div style={{ ...style({ top: inset, left: inset }), borderTopWidth: 1, borderLeftWidth: 1 }} />
      <div style={{ ...style({ top: inset, right: inset }), borderTopWidth: 1, borderRightWidth: 1 }} />
      <div style={{ ...style({ bottom: inset, left: inset }), borderBottomWidth: 1, borderLeftWidth: 1 }} />
      <div style={{ ...style({ bottom: inset, right: inset }), borderBottomWidth: 1, borderRightWidth: 1 }} />
    </>
  );
}

function Footer({ size }: { size: Size }) {
  const inset = size === "wide" ? 48 : 56;
  return (
    <div
      style={{
        position: "absolute",
        bottom: inset,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: EXPORT_FOOTER_SIZE_BRAND,
          letterSpacing: ".25em",
          textTransform: "uppercase",
          color: GOLD,
          fontWeight: 500,
        }}
      >
        {EXPORT_URL}
      </div>
      <div style={{ fontSize: EXPORT_FOOTER_SIZE_TAGLINE, color: TEXT }}>
        {EXPORT_TAGLINE_EN}
      </div>
      <div
        dir="rtl"
        lang="ar"
        style={{
          fontSize: EXPORT_FOOTER_SIZE_TAGLINE,
          color: TEXT,
          fontFamily: EXPORT_AR_FONT,
        }}
      >
        {EXPORT_TAGLINE_AR}
      </div>
    </div>
  );
}

function Shell({
  size,
  children,
  innerRef,
}: {
  size: Size;
  children: React.ReactNode;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  const { w, h } = dims(size);
  return (
    <div
      ref={innerRef}
      style={{
        width: w,
        height: h,
        background: BG,
        color: TEXT,
        fontFamily: SANS,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Corners size={size} />
      {children}
      <Footer size={size} />
    </div>
  );
}

/* ─────────── Concept A — The Number ─────────── */

export const ConceptA = forwardRef<HTMLDivElement, { data: CredentialData; size?: Size }>(
  ({ data, size = "wide" }, ref) => {
    const { w, h } = dims(size);
    const pad = size === "wide" ? 88 : 96;
    return (
      <Shell size={size} innerRef={ref}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: pad,
            display: "flex",
            flexDirection: size === "wide" ? "row" : "column",
            alignItems: "stretch",
            gap: size === "wide" ? 56 : 36,
          }}
        >
          {/* Left — the number */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: size === "wide" ? "flex-start" : "center",
              textAlign: size === "wide" ? "left" : "center",
            }}
          >
            <div
              style={{
                fontFamily: SERIF,
                fontSize: size === "wide" ? 220 : 200,
                lineHeight: 1,
                color: GOLD,
                fontWeight: 400,
              }}
            >
              {data.score ?? "—"}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                letterSpacing: ".3em",
                textTransform: "uppercase",
                color: TEXT_MUTED,
              }}
            >
              Presence Score
            </div>
          </div>

          {/* Divider */}
          {size === "wide" && (
            <div style={{ width: 1, background: GOLD_LINE, alignSelf: "stretch" }} />
          )}

          {/* Right — tier + identity */}
          <div
            style={{
              flex: 1.1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              textAlign: size === "wide" ? "left" : "center",
            }}
          >
            {/* Tier pills */}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: size === "wide" ? "flex-start" : "center",
                marginBottom: 28,
                flexWrap: "wrap",
              }}
            >
              {["Observer", "Explorer", "Strategist", "Voice", "Presence"].map((t) => {
                const TIERS_ORDER = ["Observer", "Explorer", "Strategist", "Voice", "Presence"];
                const active = t.toLowerCase() === data.tierName.toLowerCase();
                const passed =
                  TIERS_ORDER.indexOf(t) <
                  TIERS_ORDER.indexOf(data.tierName);
                return (
                  <span
                    key={t}
                    style={{
                      fontSize: 10,
                      letterSpacing: ".22em",
                      textTransform: "uppercase",
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: `1px solid ${active ? GOLD : GOLD_LINE}`,
                      background: active ? "rgba(212,176,86,.12)" : "transparent",
                      color: active ? GOLD : passed ? TEXT_MUTED : TEXT_HINT,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {t}
                  </span>
                );
              })}
            </div>

            <div
              style={{
                fontFamily: SERIF,
                fontSize: 36,
                lineHeight: 1.1,
                color: TEXT,
                marginBottom: 8,
              }}
            >
              {data.fullName}
            </div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 20 }}>{data.role}</div>
            <div
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 16,
                lineHeight: 1.4,
                color: TEXT_MUTED,
                maxWidth: 360,
                marginLeft: size === "wide" ? 0 : "auto",
                marginRight: size === "wide" ? 0 : "auto",
              }}
            >
              &ldquo;{data.quote}&rdquo;
            </div>
          </div>
        </div>
      </Shell>
    );
  }
);
ConceptA.displayName = "ConceptA";

/* ─────────── Concept B — The Statement ─────────── */

export const ConceptB = forwardRef<HTMLDivElement, { data: CredentialData; size?: Size }>(
  ({ data, size = "wide" }, ref) => {
    const pad = size === "wide" ? 112 : 96;
    return (
      <Shell size={size} innerRef={ref}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: pad,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: ".35em",
              textTransform: "uppercase",
              color: GOLD,
              marginBottom: 36,
            }}
          >
            ✦ &nbsp; {data.tierName} &nbsp; ✦
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: size === "wide" ? 56 : 60,
              lineHeight: 1.18,
              color: TEXT,
              maxWidth: size === "wide" ? 880 : 820,
              fontWeight: 400,
            }}
          >
            &ldquo;{data.quote}&rdquo;
          </div>
          <div
            style={{
              marginTop: 44,
              fontFamily: SERIF,
              fontSize: 22,
              color: TEXT,
            }}
          >
            {data.fullName}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: TEXT_MUTED,
            }}
          >
            {data.role}
          </div>
        </div>
      </Shell>
    );
  }
);
ConceptB.displayName = "ConceptB";

/* ─────────── Concept C — The Signal ─────────── */

export const ConceptC = forwardRef<HTMLDivElement, { data: CredentialData; size?: Size }>(
  ({ data, size = "wide" }, ref) => {
    const pad = size === "wide" ? 96 : 96;
    const confPct = data.topSignalConfidence
      ? Math.round(data.topSignalConfidence * 100)
      : null;
    return (
      <Shell size={size} innerRef={ref}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: pad,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: ".3em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Tracking · {data.tierName}
            </div>
            <div style={{ marginTop: 8, height: 1, width: 56, background: GOLD }} />
          </div>

          <div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: size === "wide" ? 46 : 52,
                lineHeight: 1.2,
                color: TEXT,
                maxWidth: size === "wide" ? 960 : 880,
              }}
            >
              {data.topSignalTitle || data.quote}
            </div>
            {confPct != null && (
              <div
                style={{
                  marginTop: 22,
                  fontSize: 16,
                  color: GOLD,
                  letterSpacing: ".05em",
                  
                }}
              >
                {confPct}% confidence · growing
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 22, color: TEXT }}>{data.fullName}</div>
              <div style={{ marginTop: 4, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: TEXT_MUTED }}>
                {data.role}
              </div>
            </div>
            {data.sector && (
              <div style={{ fontSize: 10, letterSpacing: ".25em", textTransform: "uppercase", color: TEXT_HINT }}>
                {data.sector}
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }
);
ConceptC.displayName = "ConceptC";

export const CONCEPTS = [
  { key: "A", label: "The Number", component: ConceptA },
  { key: "B", label: "The Statement", component: ConceptB },
  { key: "C", label: "The Signal", component: ConceptC },
] as const;

export type ConceptKey = (typeof CONCEPTS)[number]["key"];

export default ConceptA;