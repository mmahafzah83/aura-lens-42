/**
 * RevealCard — screen 13. Full-bleed blue, the member's read of the market,
 * and the same card is what gets exported when they share it.
 */
import { forwardRef } from "react";
import { OB, RADIUS } from "./tokens";

export interface RevealData {
  archetype: string;
  marketRead: string;
  /** The second read — a supporting archetype, when one was found. */
  secondaryRead?: string;
  /** The gap between how they describe themselves and what their writing shows. */
  theGap?: string;
  /** One verbatim sentence from one of their own posts. */
  ownWordsQuote?: string;
  /** One sentence on what that quote shows. */
  ownWordsRead?: string;
  subjects: string[];
  softGround: string[];
  figures: { value: string; label: string }[];
  /**
   * What produced each section, computed from real counts. A section with no
   * nameable source carries no line at all rather than a claim.
   */
  provenance?: { read?: string; subjects?: string; softGround?: string };
}

export interface RevealFooter {
  /** How many of the member's own posts were read. */
  posts: number;
  /** How many things the member saved. */
  saved: number;
}

/** The caption offered alongside the exported image. */
export const suggestedCaption = (posts: number): string =>
  `I let something read my last ${posts || "few"} posts and tell me how my work actually lands. ` +
  `This is what came back. Curious what yours would say.`;

/**
 * Renders a mounted reveal card to an image and hands it to the member —
 * the share sheet on mobile, a download plus a copied caption everywhere else.
 */
export async function rasteriseRevealCard(
  node: HTMLElement,
  opts: { format?: "png" | "jpeg" } = {},
): Promise<{ dataUrl: string; format: "png" | "jpeg" }> {
  // Serialise only the target subtree: cloning the whole document races with
  // any mid-flight DOM mutation (extensions, toasts) and throws.
  const { toPng } = await import("html-to-image");
  try { await (document as any).fonts?.ready; } catch { /* nothing to wait for */ }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const render = () => toPng(node, {
    pixelRatio: 2,
    width: 1080,
    height: 1350,
    style: { left: "0", top: "0" },
  });

  try {
    return { dataUrl: await render(), format: "png" };
  } catch (err) {
    console.error("[reveal] export failed, retrying once", err);
    await new Promise((r) => setTimeout(r, 300));
    return { dataUrl: await render(), format: "png" };
  }
}

export async function shareRevealCard(
  node: HTMLElement,
  opts: { fileName?: string; format?: "png" | "jpeg"; caption?: string } = {},
): Promise<"shared" | "downloaded"> {
  const { dataUrl, format } = await rasteriseRevealCard(node, { format: opts.format });
  const blob = await (await fetch(dataUrl)).blob();
  const fileName = opts.fileName ?? `my-read-from-aura.${format === "jpeg" ? "jpg" : "png"}`;
  const file = new File([blob], fileName, { type: blob.type });

  const canShare = (navigator as Navigator & { canShare?: (d: any) => boolean }).canShare;
  if (navigator.share && canShare?.call(navigator, { files: [file] })) {
    await navigator.share({ files: [file], text: opts.caption });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  if (opts.caption) {
    try { await navigator.clipboard.writeText(opts.caption); } catch { /* the member can retype it */ }
  }
  return "downloaded";
}

/** Stands in wherever a post or word figure would otherwise read zero. */
export const EMPTY_POSTS_LINE = "Nothing public yet — that's the point. Aura will build from what you save.";

const chip = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "6px 11px",
  borderRadius: RADIUS.chip,
  background: bg,
  color,
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.3,
});

const source = (line?: string) =>
  line ? (
    <p style={{ margin: "7px 0 0", fontSize: 11, lineHeight: 1.5, opacity: 0.72 }}>{line}</p>
  ) : null;

/** The private half — heavier surface, because this is the part nobody else sees. */
const privatePanel: React.CSSProperties = {
  background: "rgba(15,21,25,0.32)",
  borderRadius: 20,
  padding: 20,
};

const onlyYou = (
  <p style={{
    margin: 0, fontFamily: OB.mono, fontSize: 10.5, letterSpacing: "0.16em",
    textTransform: "uppercase", color: "rgba(255,255,255,0.80)",
  }}>Only you see this</p>
);

const privateHeading: React.CSSProperties = {
  margin: "8px 0 0", fontSize: 17, fontWeight: 700, lineHeight: 1.25, color: "#FFFFFF",
};

/** The card is a reading experience; it grows once, at the desk-sized breakpoint. */
const RVC_CSS = `
@media (min-width:1280px){
  .rvc{padding:44px 38px 38px !important;}
  .rvc-arch{font-size:46px !important;}
  .rvc-read{font-size:17px !important;line-height:1.7 !important;}
}
`;

const RevealCard = forwardRef<
  HTMLDivElement,
  { data: RevealData; footer?: RevealFooter; forExport?: boolean; emptyFiguresLine?: string }
>(({ data, footer, forExport = false, emptyFiguresLine = EMPTY_POSTS_LINE }, ref) => forExport ? (
  /* ── the shareable frame: one fixed 1080 × 1350 image, nothing that scrolls ── */
  <div
    ref={ref}
    style={{
      /* Physical properties only in this branch: the rasteriser's CSS parser does
         not implement logical properties and computes a zero box for them. */
      width: 1080,
      height: 1350,
      boxSizing: "border-box",
      background: `linear-gradient(170deg, ${OB.blue}, ${OB.blueLight} 55%, ${OB.cyan})`,
      padding: "96px 84px 74px",
      color: "#FFFFFF",
      fontFamily: OB.ui,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      overflow: "hidden",
    }}
  >
    <div>
    <p style={{
      margin: 0, fontSize: 20, letterSpacing: "0.20em", textTransform: "uppercase",
      fontFamily: OB.mono, opacity: 0.85,
    }}>How people see you</p>

    <h2 style={{
      margin: "34px 0 0", fontSize: 54, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.03em",
    }}>{data.archetype}</h2>

    {data.marketRead ? (
      <p style={{ margin: "26px 0 0", fontSize: 22, lineHeight: 1.6, opacity: 0.95 }}>{data.marketRead}</p>
    ) : null}

    {data.secondaryRead ? (
      <p style={{
        margin: "20px 0 0", fontFamily: OB.mono, fontSize: 18,
        letterSpacing: "0.10em", lineHeight: 1.4, opacity: 0.8,
      }}>{`SECOND READ · ${data.secondaryRead}`}</p>
    ) : null}
    </div>

    {/* The middle group: freed space spreads between groups, never pools. */}
    <div style={{
      display: "flex", flexDirection: "column", gap: 40,
    }}>
      {data.subjects.length > 0 ? (
        <div>
          <p style={{
            margin: "0 0 16px", fontFamily: OB.mono, fontSize: 15,
            letterSpacing: "0.18em", opacity: 0.82,
          }}>THE SIGNALS I OWN</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            {data.subjects.slice(0, 3).map((s) => (
              <span key={s} style={{
                display: "inline-block", padding: "12px 20px", borderRadius: RADIUS.chip,
                background: "rgba(255,255,255,0.18)", color: "#FFFFFF",
                fontSize: 17, fontWeight: 600, lineHeight: 1.3,
              }}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}

      {data.softGround.length > 0 ? (
        <div>
          <p style={{
            margin: "0 0 16px", fontFamily: OB.mono, fontSize: 15,
            letterSpacing: "0.18em", opacity: 0.82,
          }}>SHARPENING NEXT</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            {data.softGround.slice(0, 2).map((s) => (
              <span key={s} style={{
                display: "inline-block", padding: "12px 20px", borderRadius: RADIUS.chip,
                background: "#E0A82E",
                color: "#0F1519", fontSize: 17, fontWeight: 600, lineHeight: 1.3,
              }}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>

    <div>
      {data.figures.length > 0 ? (
        <div style={{ display: "flex", gap: 56 }}>
          {data.figures.slice(0, 3).map((f) => (
            <div key={f.label}>
              <div style={{ fontFamily: OB.mono, fontSize: 46, fontWeight: 600, lineHeight: 1 }}>{f.value}</div>
              <div style={{ fontSize: 17, opacity: 0.85, marginTop: 10 }}>{f.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 21, lineHeight: 1.6, opacity: 0.92 }}>{emptyFiguresLine}</p>
      )}

    <div style={{
      marginTop: 40, paddingTop: 34,
      borderTop: "1px solid rgba(255,255,255,0.28)",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <span style={{ fontFamily: OB.ui, fontWeight: 700, fontSize: 22, letterSpacing: "0.16em" }}>AURA</span>
      <span style={{ fontFamily: OB.mono, fontSize: 18, letterSpacing: "0.06em", opacity: 0.88 }}>
        Read by Aura · aura-intel.org
      </span>
      {footer ? null : null}
    </div>
    </div>
  </div>
) : (
  <div
    ref={ref}
    className="rvc"
    style={{
      background: `linear-gradient(170deg, ${OB.blue}, ${OB.blueLight} 55%, ${OB.cyan})`,
      borderRadius: RADIUS.hero,
      padding: "30px 24px 28px",
      color: "#FFFFFF",
      fontFamily: OB.ui,
      display: "flex",
      flexDirection: "column",
    }}
  >
    <style>{RVC_CSS}</style>
    <p style={{
      margin: 0, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase",
      fontFamily: OB.mono, opacity: 0.85,
    }}>How people see you</p>

    <h2 className="rvc-arch" style={{
      margin: "12px 0 0", fontSize: "clamp(34px, 9vw, 40px)", fontWeight: 900,
      lineHeight: 1.02, letterSpacing: "-0.03em",
    }}>{data.archetype}</h2>

    {data.marketRead ? (
      <p className="rvc-read"
        style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, opacity: 0.95 }}>{data.marketRead}</p>
    ) : null}
    {source(data.provenance?.read)}

    {data.subjects.length > 0 && (
      <>
        <p style={{ margin: "22px 0 8px", fontSize: 11.5, opacity: 0.85 }}>The signals in your read</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {data.subjects.slice(0, 3).map((s) => (
            <span key={s} style={chip("rgba(255,255,255,0.18)", "#FFFFFF")}>{s}</span>
          ))}
        </div>
        {source(data.provenance?.subjects)}
      </>
    )}

    {data.theGap ? (
      <div style={{ ...privatePanel, marginBlockStart: 24 }}>
        {onlyYou}
        <h3 style={privateHeading}>The gap</h3>
        <p style={{
          margin: "10px 0 0", fontSize: 15, lineHeight: 1.65, color: "rgba(255,255,255,0.95)",
        }}>{data.theGap}</p>
      </div>
    ) : null}

    {data.ownWordsQuote ? (
      <div style={{ ...privatePanel, marginBlockStart: 12 }}>
        {onlyYou}
        <h3 style={privateHeading}>In your own words</h3>
        <p style={{
          margin: "10px 0 0", fontSize: 15, lineHeight: 1.65, fontStyle: "italic",
          color: "rgba(255,255,255,0.95)",
        }}>“{data.ownWordsQuote}”</p>
        {data.ownWordsRead ? (
          <p style={{
            margin: "9px 0 0", fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.88)",
          }}>{data.ownWordsRead}</p>
        ) : null}
      </div>
    ) : null}

    {data.theGap || data.ownWordsQuote ? (
      <p style={{
        margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.80)",
      }}>
        The gap and your own words stay here. Only the card above is ever shared.
      </p>
    ) : null}

    {data.softGround.length > 0 && (
      <>
        <p style={{ margin: "22px 0 8px", fontSize: 11.5, opacity: 0.85 }}>Where you're thinnest</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {data.softGround.slice(0, 2).map((s) => (
            <span key={s} style={chip(OB.amber, OB.night)}>{s}</span>
          ))}
        </div>
        {source(data.provenance?.softGround)}
      </>
    )}

    {data.figures.length > 0 ? (
      <div style={{ display: "flex", gap: 26, marginBlockStart: 24 }}>
        {data.figures.slice(0, 2).map((f) => (
          <div key={f.label}>
            <div style={{ fontFamily: OB.mono, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{f.value}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginBlockStart: 5 }}>{f.label}</div>
          </div>
        ))}
      </div>
    ) : (
      <p style={{ margin: "24px 0 0", fontSize: 13.5, lineHeight: 1.6, opacity: 0.92 }}>{emptyFiguresLine}</p>
    )}

    <p style={{
      margin: "22px 0 0", marginBlockStart: "auto", paddingBlockStart: 22,
      fontFamily: OB.mono, fontSize: 11.5, letterSpacing: "0.08em",
      color: "rgba(255,255,255,0.72)",
    }}>Read by Aura · aura-intel.org</p>
  </div>
));

RevealCard.displayName = "RevealCard";
export default RevealCard;