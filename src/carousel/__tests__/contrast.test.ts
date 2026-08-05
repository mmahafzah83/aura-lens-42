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

const GROUNDS = ["paper", "field", "dark", "g1", "g2", "g3", "bgSolid", "invert"] as const;
const INKS = ["ink", "fg", "invertFg"] as const;

/**
 * WHICH INK RIDES ON WHICH GROUND.
 *
 * The inversion ground carries `invertFg` — that is what the field MEANS. It
 * does not carry `fg`, which is the ink for the PRIMARY ground, and pairing
 * the two would be inventing a combination no renderer draws. Every other
 * ground carries the primary ink. Where a theme leaves a field undeclared the
 * pair simply is not generated, exactly as before.
 */
function inksFor(ground: string): readonly string[] {
  return ground === "invert" ? ["invertFg"] : INKS.filter((i) => i !== "invertFg");
}

/**
 * LEGACY EXEMPTION — closed list, do not extend.
 *
 * `gradient` is an instrument theme that ships today and fails the gate at
 * 3.64:1 on bgSolid/fg. It is scheduled for retirement (superseded by the
 * template library plan), so its colours are frozen rather than corrected.
 *
 * This list MUST NOT gain new pairs. Any new theme, or any new pair on an
 * existing theme, that fails the gate still fails the suite. The exempt pair
 * is still measured and logged so the debt stays visible.
 */
const LEGACY_EXEMPT: ReadonlyArray<{ theme: string; a: string; b: string }> = [
  { theme: "gradient", a: "bgSolid", b: "fg" },
];

function isExempt(p: { theme: string; a: string; b: string }): boolean {
  return LEGACY_EXEMPT.some((e) => e.theme === p.theme && e.a === p.a && e.b === p.b);
}

type Pair = { theme: string; a: string; b: string; av: string; bv: string };

function pairsFor(name: string, t: Record<string, unknown>): Pair[] {
  const out: Pair[] = [];
  // (accent, accentInk) — always, on every theme.
  if (isHex(t.accent) && isHex(t.accentInk)) {
    out.push({ theme: name, a: "accent", b: "accentInk", av: t.accent, bv: t.accentInk });
  }
  // The accent word printed ON the inversion ground. The one pairing the
  // GROUNDS/INKS loop cannot see, because accent is neither a ground nor an
  // ink. A theme whose alternate slide replaces the accent with another
  // colour DECLARES that colour as `invertAccent`, and we test what is drawn
  // rather than what we assumed would be.
  const invAccent = isHex(t.invertAccent) ? t.invertAccent : t.accent;
  if (isHex(t.invert) && isHex(invAccent) && t.invert.toLowerCase() !== invAccent.toLowerCase()) {
    out.push({
      theme: name,
      a: "invert",
      b: isHex(t.invertAccent) ? "invertAccent" : "accent",
      av: t.invert,
      bv: invAccent,
    });
  }
  for (const g of GROUNDS) {
    const gv = t[g];
    if (!isHex(gv)) continue;
    for (const i of inksFor(g)) {
      const iv = t[i];
      if (!isHex(iv)) continue;
      if (gv.toLowerCase() === iv.toLowerCase()) continue;
      out.push({ theme: name, a: g, b: i, av: gv, bv: iv });
    }
  }
  return out;
}

/**
 * Both registries are tested, and a name that appears in both is tested TWICE
 * rather than once. A colourway that has grown a renderer (crumple, gridpaper,
 * highlighter) exists as a full 17-field Theme AND as its original token stub;
 * collapsing them would silently drop whichever came second, which is exactly
 * the pair a widening is most likely to get wrong.
 */
const ALL: Record<string, Record<string, unknown>> = {
  ...Object.fromEntries(
    Object.entries(TEMPLATE_THEMES as unknown as Record<string, Record<string, unknown>>)
      .map(([k, v]) => [`tokens:${k}`, v]),
  ),
  ...(THEMES as unknown as Record<string, Record<string, unknown>>),
};

describe("theme contrast", () => {
  it("declares at least one testable pair for every registered theme", () => {
    for (const [name, t] of Object.entries(ALL)) {
      expect(pairsFor(name, t).length, `${name} has no testable colour pair`).toBeGreaterThan(0);
    }
  });

  for (const [name, t] of Object.entries(ALL)) {
    for (const p of pairsFor(name, t)) {
      if (isExempt(p)) {
        it(`${name}: ${p.a} on ${p.b} is a LEGACY EXEMPTION (theme scheduled for retirement)`, () => {
          const r = ratio(p.av, p.bv);
          // eslint-disable-next-line no-console
          console.warn(
            `[contrast][legacy-exempt] ${name} ${p.a}(${p.av}) / ${p.b}(${p.bv}) = ${r.toFixed(2)}:1 (gate ${MIN}:1)`,
          );
          expect(r).toBeGreaterThan(1);
        });
        continue;
      }
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
