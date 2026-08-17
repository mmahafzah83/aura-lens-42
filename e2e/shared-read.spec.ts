import { test, expect } from "../playwright-fixture";

/** A permanent seeded share row. It is public and ungated by design. */
const LIVE_TOKEN = "selftest0001";
const DEAD_TOKEN = "definitely-not-a-real-token";

test.describe("the public shared read", () => {
  test("shows the read and converts to the assessment", async ({ page }) => {
    await page.goto(`/r/${LIVE_TOKEN}`);

    // The archetype is the hero, and it is not empty.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveText(/^\s*$/);

    // The subjects they own.
    await expect(page.getByText("THE SUBJECTS THEY OWN")).toBeVisible();
    const subjects = page.locator("ul li");
    await expect(subjects.first()).toBeVisible();
    expect(await subjects.count()).toBeGreaterThan(0);

    // The Arabic pull quote is laid out right to left.
    const quote = page.locator("blockquote");
    await expect(quote).toBeVisible();
    await expect(quote).toHaveAttribute("dir", "rtl");

    // "Read me too" is the conversion.
    await page.getByRole("button", { name: /read me too/i }).click();
    await expect(page).toHaveURL(/\/assessment/);
  });

  test("a revoked or unknown token still offers a read of your own", async ({ page }) => {
    await page.goto(`/r/${DEAD_TOKEN}`);
    await expect(page.getByText(/no longer shared/i)).toBeVisible();
    const cta = page.getByRole("button", { name: /get your own read/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/assessment/);
  });
});
