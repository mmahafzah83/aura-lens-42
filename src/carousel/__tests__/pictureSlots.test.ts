import { describe, expect, it } from "vitest";
import { pictureTextPlan } from "../slots";

/** Z2 — nothing a member wrote may vanish without being named. */
describe("pictureTextPlan", () => {
  const slots = { hero_lines: [{}], headline: {}, body: [{}], subline: {} };

  it("keeps everything when there is no picture", () => {
    const p = pictureTextPlan("frame", slots, false);
    expect(p.dropped).toEqual([]);
  });

  it("a band slide carries at most two text slots, and names the rest", () => {
    const p = pictureTextPlan("frame", slots, true);
    expect(p.kept.length).toBeLessThanOrEqual(2);
    expect(p.kept[0]).toBe("hero_lines");
    expect(p.dropped.length).toBeGreaterThan(0);
    expect([...p.kept, ...p.dropped].sort()).toEqual(["body", "headline", "hero_lines", "subline"]);
  });
});
