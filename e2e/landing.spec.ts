import { test, expect } from "../playwright-fixture";

test.describe("landing", () => {
  test("renders the hero and prices the seat once, with no struck-through price", async ({ page }) => {
    await page.goto("/");

    // The hero is real content, not just a 200.
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveText(/^\s*$/);

    // The price appears exactly once.
    const priceHits = await page.evaluate(() => {
      const text = document.body.innerText;
      return (text.match(/\$29/g) || []).length;
    });
    expect(priceHits, "the $29 price should appear exactly once").toBe(1);

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
