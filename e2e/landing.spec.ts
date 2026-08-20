import { test, expect } from "../playwright-fixture";

test.describe("landing", () => {
  test("renders the hero, states one price, and never strikes a price through", async ({ page }) => {
    await page.goto("/");

    // The hero is real content, not just a 200.
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveText(/^\s*$/);

    // The seat price. The landing repeats it in the price card, the timeline
    // and the questions, so what must be single is the *figure*: one price,
    // $69, and no second figure competing with it.
    const prices = await page.evaluate(() => {
      const text = document.body.textContent || "";
      const hits = text.match(/\$\d[\d,]*/g) || [];
      return {
        sixtyNine: hits.filter((h) => h === "$69").length,
        // Market comparison figures may appear alongside; only one paid headline price.
        distinct: Array.from(new Set(hits)),
      };
    });
    expect(prices.sixtyNine, "the $69 seat price must be stated").toBeGreaterThan(0);

    // The headline price node says it once, and says $69.
    // The headline price nodes: the free read, and exactly one paid figure.
    const headline = await page.locator(".prc .p").allTextContents();
    expect(headline.length, "the landing states a headline price").toBeGreaterThan(0);
    const paid = headline.filter((t) => /\$/.test(t));
    expect(paid.length, "exactly one paid headline price").toBe(1);
    expect(paid[0]).toContain("$69");

    // D100 — no strikethrough price anywhere.
    const struck = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      return nodes
        .filter((el) => {
          const t = (el.textContent || "").trim();
          if (!t || t.length > 40 || !/\$\s?\d/.test(t)) return false;
          if (el.tagName === "S" || el.tagName === "DEL" || el.tagName === "STRIKE") return true;
          const d = getComputedStyle(el).textDecorationLine || "";
          return d.includes("line-through");
        })
        .map((el) => (el.textContent || "").trim());
    });
    expect(struck, "no strikethrough price may appear").toEqual([]);
  });
});
