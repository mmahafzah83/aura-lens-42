import { describe, it, expect } from "vitest";
import {
  filterOwnPosts, filterOwnComments, applyBudget, twelveMonthsAgo, ownWritingBlocks,
} from "../linkedinOwnWriting.ts";

const NOW = new Date("2026-10-06T12:00:00Z");
const SINCE = twelveMonthsAgo(NOW);
const me = { publicIdentifier: "member" };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("12-month window", () => {
  it("is twelve months back", () => {
    expect(SINCE.toISOString().slice(0, 10)).toBe("2025-10-06");
  });
  it("drops posts and comments older than 12 months", () => {
    const posts = filterOwnPosts([
      { author: me, content: "new", postedAt: { timestamp: Date.parse("2026-09-01") } },
      { author: me, content: "old", postedAt: { date: "2025-09-30T00:00:00Z" } },
    ], "member", SINCE);
    expect(posts.map((p) => p.text)).toEqual(["new"]);
    const comments = filterOwnComments([
      { author: me, commentary: words(20), createdAt: "2026-01-01T00:00:00Z" },
      { author: me, commentary: words(20), createdAt: "2024-01-01T00:00:00Z" },
    ], "member", SINCE);
    expect(comments).toHaveLength(1);
  });
});

describe("15-word comment filter", () => {
  it("keeps 15+ words and drops short replies and other authors", () => {
    const c = filterOwnComments([
      { author: me, commentary: "Congratulations, well deserved!" },
      { author: me, commentary: words(14) },
      { author: me, commentary: words(15), post: { content: "P".repeat(500) } },
      { author: { publicIdentifier: "someone" }, commentary: words(30) },
    ], "member", SINCE);
    expect(c).toHaveLength(1);
    expect(c[0].parent).toHaveLength(200);
  });
});

describe("quote posts", () => {
  it("keeps only his added text, marked as a quote", () => {
    const p = filterOwnPosts([
      { author: me, content: "My view on this.", repost: { content: "Someone else's post" } },
      { author: me, content: "", repost: { content: "pure reshare" } },
    ], "member", SINCE);
    expect(p).toEqual([{ text: "My view on this.", at: null, quote: true }]);
    const block = ownWritingBlocks(p, []);
    expect(block).toContain("My view on this.");
    expect(block).not.toContain("Someone else's post");
  });
});

describe("40,000-character budget", () => {
  it("drops the oldest first across posts and comments", () => {
    const posts = [
      { text: "a".repeat(15000), at: 3, quote: false },
      { text: "b".repeat(15000), at: 1, quote: false },
    ];
    const comments = [
      { text: "c".repeat(15000), at: 2, parent: "" },
      { text: "d".repeat(5000), at: 4, parent: "" },
    ];
    const r = applyBudget(posts, comments, 40000);
    expect(r.posts.map((p) => p.at)).toEqual([3]);
    expect(r.comments.map((c) => c.at)).toEqual([2, 4]);
    expect(r.chars).toBe(35000);
  });
  it("keeps everything under budget", () => {
    const r = applyBudget([{ text: "x", at: 1, quote: false }], [], 40000);
    expect(r.posts).toHaveLength(1);
  });
});
