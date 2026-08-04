/**
 * CONTRAST GATE — a colour set may not enter the registry unreadable.
 *
 * WCAG 2.1 relative luminance, computed locally: a colour contrast
 * dependency is a supply-chain surface for a twelve-line formula.
 *
 * Every declared pair must clear 4.5:1. "Declared" is the operative word —
 * we never invent a pairing. A background token is tested against a
 * foreground token only when BOTH are declared on that theme and they hold
 * different values, because a surface that equals the ink is an inversion
 * ground, not a text pairing, and asserting 1.0 against itself would be a
 * fake failure that teaches people to ignore this file.
 */
import { describe, expect, it } from "vitest";
import { THEMES } from "../render/themes";
import { TEMPLATE_THEMES } from "../render/themes";

const MIN = 4.5;

/** sRGB hex -> WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const parts = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = parts.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Only opaque hex is testable. Gradients and rgba() are skipped by name. */
function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

const GROUNDS = ["paper", "field", "dark", "g1", "bgSolid"] as const;
const INKS = ["ink", "fg"] as const;

type Pair = { theme: string; a: string; b: string; av: string; bv: string };

function pairsFor(name: string, t: Record<string, unknown>): Pair[] {
  const out: Pair[] = [];
  // (accent, accentInk) — always, on every theme.
  if (isHex(t.accent) && isHex(t.accentInk)) {
    out.push({ theme: name, a: "accent", b: "accentInk", av: t.accent, bv: t.accentInk });
  }
  for (const g of GROUNDS) {
    const gv = t[g];
    if (!isHex(gv)) continue;
    for (const i of INKS) {
      const iv = t[i];
      if (!isHex(iv)) continue;
      if (gv.toLowerCase() === iv.toLowerCase()) continue;
      out.push({ theme: name, a: g, b: i, av: gv, bv: iv });
    }
  }
  return out;
}

const ALL: Record<string, Record<string, unknown>> = {
  ...(THEMES as unknown as Record<string, Record<string, unknown>>),
  ...(TEMPLATE_THEMES as unknown as Record<string, Record<string, unknown>>),
};

describe("theme contrast", () => {
  it("declares at least one testable pair for every registered theme", () => {
    for (const [name, t] of Object.entries(ALL)) {
      expect(pairsFor(name, t).length, `${name} has no testable colour pair`).toBeGreaterThan(0);
    }
  });

  for (const [name, t] of Object.entries(ALL)) {
    for (const p of pairsFor(name, t)) {
      it(`${name}: ${p.a} on ${p.b} clears ${MIN}:1`, () => {
        const r = ratio(p.av, p.bv);
        expect(
          Math.round(r * 100) / 100,
          `${name} ${p.a}(${p.av}) / ${p.b}(${p.bv}) = ${r.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(MIN);
      });
    }
  }
});
