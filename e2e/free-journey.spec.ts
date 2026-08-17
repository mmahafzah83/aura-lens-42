import { test, expect } from "../playwright-fixture";

/** A public profile with enough posts to read. Override per environment. */
const PROFILE = process.env.E2E_LINKEDIN_URL || "linkedin.com/in/satyanadella";

/** The read calls a scraper and a model; it is slow by nature. */
const READ_TIMEOUT = 180_000;

test.describe("the free journey", () => {
  test.slow();

  test("landing → assessment → a read → the CV screen", async ({ page }) => {
    test.setTimeout(READ_TIMEOUT + 60_000);

    await page.goto("/");
    // Every landing CTA points at the one journey.
    await page.getByRole("link", { name: /read|assessment|start/i }).first().click();
    await expect(page).toHaveURL(/\/assessment/);

    // The gate has one job; walk past it if it is showing.
    const begin = page.getByRole("button", { name: /read my profile|begin|start/i }).first();
    await begin.click();

    const address = page.locator("#asg-addr");
    await expect(address).toBeVisible();
    await address.fill(PROFILE);
    await page.getByRole("button", { name: /read my profile/i }).click();

    // The result card carries an archetype, not a spinner.
    const archetype = page.locator(".asg-read h1, .asg-read h2").first();
    await expect(archetype).toBeVisible({ timeout: READ_TIMEOUT });
    await expect(archetype).not.toHaveText(/^\s*$/);

    // Continue hands off to the real onboarding, which asks for the CV.
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByText(/\bCV\b/i).first()).toBeVisible({ timeout: 60_000 });
  });

  test("the address is always re-enterable", async ({ page }) => {
    test.setTimeout(READ_TIMEOUT + 60_000);

    await page.goto("/assessment");
    await page.getByRole("button", { name: /read my profile|begin|start/i }).first().click();
    const address = page.locator("#asg-addr");
    await expect(address).toBeVisible();
    await address.fill(PROFILE);
    await page.getByRole("button", { name: /read my profile/i }).click();
    await expect(page.locator(".asg-read").first()).toBeVisible({ timeout: READ_TIMEOUT });

    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    // "Use a different profile" returns to the input.
    const different = page.getByText(/use a different profile/i).first();
    await expect(different).toBeVisible({ timeout: 60_000 });
    await different.click();
    await expect(page.getByLabel(/your linkedin address/i)).toBeVisible();

    // So does the back arrow, once the result is showing again.
    await page.getByLabel(/your linkedin address/i).fill(PROFILE);
    await page.getByRole("button", { name: /read|continue/i }).first().click();
    const back = page.getByRole("button", { name: /back/i }).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await expect(page.getByLabel(/your linkedin address/i)).toBeVisible();
    }
  });
});
