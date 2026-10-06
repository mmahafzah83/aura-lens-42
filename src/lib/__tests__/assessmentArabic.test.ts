import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en.json";
import ar from "@/i18n/locales/ar.json";

const PREFIX = /^(assess|journey|wait|fail|reveal|pub)\./;
const FORMS = ["zero", "one", "two", "few", "many", "other"];
const E = en as Record<string, string>;
const A = ar as Record<string, string>;
const vars = (s: string) => [...new Set(s.match(/\{\{\w+\}\}/g) ?? [])].sort();
const tags = (s: string) => (s.match(/<\/?\d+>/g) ?? []).sort();

const enKeys = Object.keys(E).filter((k) => PREFIX.test(k));
const plural = new Set(enKeys.filter((k) => /_(one|other)$/.test(k)).map((k) => k.replace(/_(one|other)$/, "")));

describe("/assessment Arabic", () => {
  it("has every plain key", () => {
    const missing = enKeys.filter((k) => !/_(one|other)$/.test(k) && !(k in A));
    expect(missing).toEqual([]);
  });
  it("has all six forms for every plural base", () => {
    const missing: string[] = [];
    for (const b of plural) for (const f of FORMS) if (!(`${b}_${f}` in A)) missing.push(`${b}_${f}`);
    expect(missing).toEqual([]);
  });
  it("keeps placeholders and tags in step with English", () => {
    const bad: string[] = [];
    for (const k of enKeys) {
      if (/_(one|other)$/.test(k)) continue;
      if (vars(E[k]).join() !== vars(A[k]).join() || tags(E[k]).join() !== tags(A[k]).join()) bad.push(k);
    }
    for (const b of plural) {
      const ev = new Set([...vars(E[`${b}_one`]), ...vars(E[`${b}_other`])]);
      const et = tags(E[`${b}_other`]).join();
      for (const f of FORMS) {
        const s = A[`${b}_${f}`];
        // Arabic may drop a number that its unit word already carries (one/two).
        if (vars(s).some((v) => !ev.has(v) && v !== "{{count}}") || tags(s).join() !== et) bad.push(`${b}_${f}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** Arabic may only use variables the code passes: English's own, or these verified extras. */
const SHARED = new Set(["imprint", "desk", "seatCta", "trustLabel"]);
const EXTRA: Record<string, string[]> = {
  "auth.signup.sub": ["minutes"],
  "seatOffer.waveNoteLater": ["size"],
  "firstFlight.progressLast": ["r"],
  "cr.lowest_one": ["n"],
  "cr.lowest_other": ["n"],
};
describe("Arabic placeholders, every key", () => {
  it("uses no variable the code does not pass", () => {
    const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, "");
    const bad: string[] = [];
    for (const [k, s] of Object.entries(A)) {
      const b = base(k);
      const e = E[k] ?? E[`${b}_other`] ?? E[b];
      if (e == null) continue;
      const ok = new Set([...vars(e), ...vars(E[`${b}_one`] ?? ""), ...(k !== b ? ["{{count}}"] : [])]);
      for (const v of vars(s)) {
        const n = v.slice(2, -2);
        if (!ok.has(v) && !SHARED.has(n) && !(EXTRA[k] ?? []).includes(n)) bad.push(`${k}: ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
