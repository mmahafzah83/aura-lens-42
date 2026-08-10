/**
 * RevealCard — screen 13. Full-bleed blue, the member's read of the market,
 * and the same card is what gets exported when they share it.
 */
import { forwardRef } from "react";
import { OB, RADIUS } from "./tokens";

export interface RevealData {
  archetype: string;
  marketRead: string;
  subjects: string[];
  softGround: string[];
  figures: { value: string; label: string }[];
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
export async function shareRevealCard(
  node: HTMLElement,
  opts: { fileName?: string; format?: "png" | "jpeg"; caption?: string } = {},
): Promise<"shared" | "downloaded"> {
  const { toPng, toJpeg } = await import("html-to-image");
  const rect = node.getBoundingClientRect();
  const pixelRatio = rect.width > 0 ? 1200 / rect.width : 2;
  const format = opts.format ?? "png";
  const dataUrl = format === "jpeg"
    ? await toJpeg(node, { pixelRatio, quality: 0.92, cacheBust: true })
    : await toPng(node, { pixelRatio, cacheBust: true });

  const blob = await (await fetch(dataUrl)).blob();
  const fileName = opts.fileName ?? `my-read-from-aura.${format === "jpeg" ? "jpg" : "png"}`;
  const file = new File([blob], fileName, { type: blob.type });

  const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text: opts.caption });
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

const RevealCard = forwardRef<
  HTMLDivElement,
  { data: RevealData; footer?: RevealFooter; forExport?: boolean }
>(({ data, footer, forExport = false }, ref) => (
  <div
    ref={ref}
    style={{
      background: `linear-gradient(170deg, ${OB.blue}, ${OB.blueLight} 55%, ${OB.cyan})`,
      borderRadius: forExport ? 0 : RADIUS.hero,
      padding: forExport ? "56px 44px 44px" : "30px 24px 28px",
      color: "#FFFFFF",
      fontFamily: OB.ui,
      display: "flex",
      flexDirection: "column",
      ...(forExport ? { inlineSize: 600, minBlockSize: 750 } : null),
    }}
  >
    <p style={{
      margin: 0, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase",
      fontFamily: OB.mono, opacity: 0.85,
    }}>How people see you</p>

    <h2 style={{
      margin: "12px 0 0", fontSize: "clamp(34px, 9vw, 40px)", fontWeight: 900,
      lineHeight: 1.02, letterSpacing: "-0.03em",
    }}>{data.archetype}</h2>

    {data.marketRead ? (
      <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, opacity: 0.95 }}>{data.marketRead}</p>
    ) : null}

    {data.subjects.length > 0 && (
      <>
        <p style={{ margin: "22px 0 8px", fontSize: 11.5, opacity: 0.85 }}>The subjects you own</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {data.subjects.slice(0, 3).map((s) => (
            <span key={s} style={chip("rgba(255,255,255,0.18)", "#FFFFFF")}>{s}</span>
          ))}
        </div>
      </>
    )}

    {data.softGround.length > 0 && (
      <>
        <p style={{ margin: "18px 0 8px", fontSize: 11.5, opacity: 0.85 }}>Ground still soft</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {data.softGround.slice(0, 2).map((s) => (
            <span key={s} style={chip(OB.amber, OB.night)}>{s}</span>
          ))}
        </div>
      </>
    )}

    {data.figures.length > 0 && (
      <div style={{ display: "flex", gap: 26, marginBlockStart: 24 }}>
        {data.figures.slice(0, 2).map((f) => (
          <div key={f.label}>
            <div style={{ fontFamily: OB.mono, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{f.value}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginBlockStart: 5 }}>{f.label}</div>
          </div>
        ))}
      </div>
    )}

    {footer ? (
      <div style={{
        marginBlockStart: "auto", paddingBlockStart: 26,
        borderBlockStart: "1px solid rgba(255,255,255,0.28)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/aura-mark.svg" alt="Aura" width={22} height={22} style={{ display: "block" }} />
          <span style={{ fontFamily: OB.mono, fontSize: 11.5, letterSpacing: "0.08em" }}>
            Read by Aura · aura-intel.org
          </span>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5, opacity: 0.85 }}>
          A snapshot of how my work reads from the outside — built from {footer.posts} of my posts
          and {footer.saved} things I saved.
        </p>
      </div>
    ) : null}
  </div>
));

RevealCard.displayName = "RevealCard";
export default RevealCard;