import { test, expect } from "../playwright-fixture";

/** A public profile with enough posts to read. Override per environment. */
const PROFILE = process.env.E2E_LINKEDIN_URL || "linkedin.com/in/satyanadella";

/** The read calls a scraper and a model; it is slow by nature. */
const READ_TIMEOUT = 180_000;

test.describe("the free journey", () => {
  test.slow();

  /* One test, because each run spends a real read. Landing → assessment →
     a live read → the hand-off into the real onboarding. */
  test("landing → assessment → a read → onboarding", async ({ page }) => {
    test.setTimeout(READ_TIMEOUT + 120_000);

    await page.goto("/");
    await page.locator('a[href="/assessment"]').first().click();
    await expect(page).toHaveURL(/\/assessment/);

    await page.getByRole("button", { name: /start with my linkedin/i }).first().click();

    const address = page.locator("#asg-addr");
    await expect(address).toBeVisible();
    await address.fill(PROFILE);
    await page.getByRole("button", { name: /read my profile/i }).click();

    // The result card carries an archetype, not a spinner.
    const archetype = page.locator(".rvc-arch").first();
    await expect(archetype).toBeVisible({ timeout: READ_TIMEOUT });
    await expect(archetype).not.toHaveText(/^\s*$/);

    // The read names the ground and the gap, and gives him the card first.
    await expect(page.getByText(/the space nobody has claimed/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /save this card/i })).toBeVisible();

    // Continue hands off to the real onboarding — never a second assessment.
    await page.getByRole("button", { name: /^Continue/ }).first().click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });

    await expect(page.getByText(/step 1 of 5/i).first()).toBeVisible({ timeout: 60_000 });
    const start = page.getByRole("button", { name: /^Start$/ });
    await expect(start).toBeVisible();
    await start.click();

    // Screen one of the walk is reachable and is not an error surface.
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });
});
