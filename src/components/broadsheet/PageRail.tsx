import React from "react";
import { INK, SPOT, ACTION, INK_FAINT } from "./pressTokens";

export interface PageRailProps {
  w: number;
  h: number;
  current: number; // 1-based
  total: number;
  rtl: boolean;
}

export default function PageRail({ w, h, current, total, rtl }: PageRailProps) {
  const edgePad = 68;
  const gap = 12;
  const railY = h - 128;
  const segHeight = 8;
  const available = w - edgePad * 2 - gap * Math.max(total - 1, 0);
  const segW = total > 0 ? available / total : 0;

  const segs: React.ReactNode[] = [];
  for (let i = 0; i < total; i++) {
    // Visual index in rendering order (LTR = i, RTL = total-1-i)
    const visualIdx = rtl ? total - 1 - i : i;
    const x = edgePad + visualIdx * (segW + gap);
    const pageNum = i + 1;
    const isCurrent = pageNum === current;
    const isBefore = pageNum < current;
    const fill = isCurrent ? SPOT : isBefore ? INK : INK_FAINT;
    segs.push(
      <rect key={`seg-${i}`} x={x} y={railY} width={segW} height={segHeight} fill={fill} />
    );
    if (isCurrent) {
      const cx = x + segW / 2;
      const triTop = railY - 6 - 10;
      const triBaseY = railY - 6;
      segs.push(
        <polygon
          key={`tri-${i}`}
          points={`${cx - 8},${triTop} ${cx + 8},${triTop} ${cx},${triBaseY}`}
          fill={ACTION}
        />
      );
    }
  }
  return <g>{segs}</g>;
}