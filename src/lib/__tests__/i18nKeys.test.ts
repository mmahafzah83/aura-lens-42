import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "@/i18n/locales/en.json";
import { OPERATION_STAGES } from "../../../supabase/functions/_shared/stageKeys";

/**
 * Every literal key passed to t("…"), i18n.t("…") or <Trans i18nKey="…"> in src
 * must exist in en.json — plain, or as a plural (_one/_other).
 */
const EN = en as Record<string, string>;
const has = (k: string) => k in EN || (`${k}_one` in EN && `${k}_other` in EN);

const ROOT = join(__dirname, "../..");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== "__tests__" && f !== "node_modules") walk(p); }
    else if (/\.(ts|tsx)$/.test(f)) files.push(p);
  }
};
walk(ROOT);

const RE = /(?:\bt\(\s*|i18nKey=\{?\s*)(["'])([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\1/g;

const used = new Map<string, string>();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(RE)) used.set(m[2], f.replace(ROOT, "src"));
}

const PREFIXES = ["assess.", "journey.", "wait.", "fail.", "reveal.", "pub."];

describe("translation keys", () => {
  it("every literal key used in src exists in en.json", () => {
    const missing = [...used].filter(([k]) => !has(k)).map(([k, f]) => `${k}  (${f})`);
    expect(missing).toEqual([]);
  });

  it("the scan finds the keys", () => expect(used.size).toBeGreaterThan(300));

  it("the route prefixes are actually used", () => {
    for (const p of PREFIXES) expect([...used.keys()].some((k) => k.startsWith(p))).toBe(true);
  });

  it("every server stage key has a display key", () => {
    for (const [op, keys] of Object.entries(OPERATION_STAGES)) {
      for (const k of keys) expect(has(`journey.stage.${op}.${k}`)).toBe(true);
    }
  });

  it("the six report items have a title and a line", () => {
    for (let n = 1; n <= 6; n++) {
      expect(has(`assess.inside.${n}.title`)).toBe(true);
      expect(has(`assess.inside.${n}.line`)).toBe(true);
    }
  });
});
