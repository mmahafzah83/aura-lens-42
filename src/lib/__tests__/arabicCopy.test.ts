import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ar = JSON.parse(readFileSync(join(__dirname, "../../i18n/locales/ar.json"), "utf8")) as Record<string, string>;
const PENDING = new Set([
  "auth.meta.assessmentTitle", // pending Arabic rewrite
  "auth.meta.signinTitle", // pending Arabic rewrite
  "auth.meta.requestTitle", // pending Arabic rewrite
  "auth.meta.inviteTitle", // pending Arabic rewrite
  "frame.meta.home", // pending Arabic rewrite
  "frame.meta.intelligence", // pending Arabic rewrite
  "frame.meta.opportunities", // pending Arabic rewrite
  "frame.meta.library", // pending Arabic rewrite
  "frame.meta.drafts", // pending Arabic rewrite
  "frame.meta.overnight", // pending Arabic rewrite
  "frame.meta.authority", // pending Arabic rewrite
  "frame.meta.influence", // pending Arabic rewrite
  "frame.meta.momentum", // pending Arabic rewrite
  "frame.meta.widgets", // pending Arabic rewrite
  "frame.meta.identity", // pending Arabic rewrite
  "frame.meta.dashboard", // pending Arabic rewrite
  "frame.header.yourDeskUnread", // pending Arabic rewrite
  "frame.rail.home", // pending Arabic rewrite
  "settings.meta.title", // pending Arabic rewrite
  "settings.linkedin.addressOnFile", // pending Arabic rewrite
 ]);
const forbidden = /وعددها|، عددها|—|[→←↗↖↘↙]|الأكاديميا|(?<![\u0600-\u06ff])(?:يتم|تم )/u;

describe("Arabic copy guard", () => {
  it("rejects banned phrasing outside the explicit pending rewrites", () => {
    expect(Object.entries(ar).filter(([key, value]) => !PENDING.has(key) && forbidden.test(value))).toEqual([]);
  });
  it("does not mistake ordinary words for passive helpers", () => {
    for (const text of ["اهتمامك", "مكتمل", "يتمحور", "تعتمد"]) expect(forbidden.test(text)).toBe(false);
    for (const text of ["يتم حفظه", "تم حفظه", "هذا — ذاك", "تابع ↖"]) expect(forbidden.test(text)).toBe(true);
  });
});
