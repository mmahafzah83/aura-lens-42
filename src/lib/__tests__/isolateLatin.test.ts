import { describe, it, expect } from "vitest";
import { isolateLatin } from "@/lib/arDisplay";

const L = "\u2066", P = "\u2069";
describe("isolateLatin", () => {
  it("isolates names and keeps the full stop outside", () => {
    expect(isolateLatin("راسلنا على support@aura-intel.org.")).toBe(`راسلنا على ${L}support@aura-intel.org${P}.`);
    expect(isolateLatin("لماذا وُجد KnownBy.")).toBe(`لماذا وُجد ${L}KnownBy${P}.`);
  });
  it("keeps multi-word names and a bracketed tail in one run", () => {
    expect(isolateLatin("عبر Lovable Cloud")).toBe(`عبر ${L}Lovable Cloud${P}`);
    expect(isolateLatin("Google (Gemini): يكتب")).toBe(`${L}Google (Gemini)${P}: يكتب`);
  });
  it("leaves pure Arabic untouched", () => expect(isolateLatin("الدورة")).toBe("الدورة"));
});
