import { describe, it, expect } from "vitest";
import { checkInvariants } from "../../../supabase/functions/generate-deck/invariants.ts";
import fx from "..//__fixtures__/en-9-crumple.json";

describe("EF checkInvariants", () => {
  it("runs against a deck with hero lines", () => {
    const ir: any = fx;
    const heroCount = ir.slides.filter((s: any) => s.slots.hero_lines?.length).length;
    expect(heroCount).toBeGreaterThan(0);
    const errs = checkInvariants(ir, {});
    console.log("hero slides:", heroCount, "failures:", errs);
    expect(Array.isArray(errs)).toBe(true);
  });
});
