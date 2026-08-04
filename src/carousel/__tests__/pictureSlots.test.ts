import { describe, expect, it } from "vitest";
import { droppableSlotCount, pictureTextPlan } from "../slots";

/**
 * Nothing is dropped by counting. A slot goes only when MEASUREMENT — the fit
 * ladder, exhausted — asks for one, and even then it is named to the member.
 */
describe("pictureTextPlan", () => {
  const slots = { hero_lines: [{}], headline: {}, body: [{}], subline: {} };
  const cover = { chip: {}, hero_lines: [{}], subline: {} };

  it("keeps everything when there is no picture", () => {
    const p = pictureTextPlan("frame", slots, false);
    expect(p.dropped).toEqual([]);
  });

  it("a band slide keeps every filled slot until measurement says otherwise", () => {
    const p = pictureTextPlan("frame", slots, true);
    expect(p.dropped).toEqual([]);
    expect(p.kept.sort()).toEqual(["body", "headline", "hero_lines", "subline"]);
  });

  it("a measured overflow drops the lowest priority slot first, and names it", () => {
    const p = pictureTextPlan("frame", slots, true, 1);
    expect(p.dropped).toEqual(["subline"]);
    expect(p.kept[0]).toBe("hero_lines");
    expect([...p.kept, ...p.dropped].sort()).toEqual(["body", "headline", "hero_lines", "subline"]);
  });

  it("never drops the hook, however much overflow is reported", () => {
    const p = pictureTextPlan("frame", slots, true, 99);
    expect(p.kept).toEqual(["hero_lines"]);
    expect(p.dropped.length).toBe(3);
  });

  it("a cover keeps label, hook and framing — the picture is behind the type", () => {
    const p = pictureTextPlan("cover_hero", cover, true, 3);
    expect(p.dropped).toEqual([]);
    expect(p.kept.sort()).toEqual(["chip", "hero_lines", "subline"]);
  });

  it("counts what a band slide could still give up", () => {
    expect(droppableSlotCount(slots)).toBe(3);
    expect(droppableSlotCount({ hero_lines: [{}] })).toBe(0);
  });
});
