/**
 * ENGAGEMENT ROW — like, comment, share, divider, save.
 *
 * A close-slide device and nothing else: INV-23 fails any other archetype that
 * draws it. Icons only, never a fabricated count. Inline SVG with a literal
 * colour, because html-to-image cannot resolve a custom property (Law #11).
 */
import React from "react";

export interface EngagementRowProps {
  /** One colour for every glyph. The caller decides ink or accent. */
  color: string;
  size?: number;
}

export const ENGAGEMENT_ROW_MARK = "engagement-row";

export const EngagementRow: React.FC<EngagementRowProps> = ({ color, size = 48 }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { display: "block", flex: "0 0 auto" },
  };
  const gap = Math.round(size * 0.85);
  return (
    <div
      data-engagement-row={ENGAGEMENT_ROW_MARK}
      style={{ display: "flex", alignItems: "center", gap }}
    >
      {/* like */}
      <svg {...common}><path d="M7 22V11l4-8a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2.4l-1.6 7A2 2 0 0 1 16.4 22H7z" /><path d="M7 11H4v11h3" /></svg>
      {/* comment */}
      <svg {...common}><path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.9A8 8 0 1 1 21 12z" /></svg>
      {/* share */}
      <svg {...common}><path d="M17 2l4 4-4 4" /><path d="M3 12V10a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 12v2a4 4 0 0 1-4 4H3" /></svg>
      {/* the divider: the save mark is a different act from the three above */}
      <span aria-hidden="true" style={{ width: 2, height: size, background: color, opacity: 0.3, flex: "0 0 auto" }} />
      {/* save */}
      <svg {...common}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1z" /></svg>
    </div>
  );
};

export default EngagementRow;
