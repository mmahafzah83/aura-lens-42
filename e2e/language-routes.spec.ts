import { test, expect } from "../playwright-fixture";
import { isArabicReadyRoute } from "../src/i18n/routes";

/* FREE — no read, no account. With Arabic stored as the choice, a route renders
   Arabic only when the registry says it is ready. The expectation comes from
   ARABIC_READY_ROUTES, so adding a route there moves this test with it. */

const ROUTES = ["/", "/assessment", "/onboarding", "/auth"];

/** The switch shows the other language in its own name. */
const switchButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button").filter({ hasText: /^(English|العربية)$/ });

test.describe("language follows the ready-routes registry", () => {
  for (const route of ROUTES) {
    const ready = isArabicReadyRoute(route);
    test(`${route} with Arabic stored renders ${ready ? "rtl/ar" : "ltr/en"}`, async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.setItem("kb_ui_lang", "ar"));
      await page.goto(route);
      await page.waitForLoadState("networkidle").catch(() => {});

      const html = page.locator("html");
      await expect(html).toHaveAttribute("dir", ready ? "rtl" : "ltr");
      await expect(html).toHaveAttribute("lang", ready ? "ar" : "en");

      if (!ready) {
        await expect(switchButton(page)).toHaveCount(0);
        return;
      }

      const sw = page.getByRole("button").filter({ hasText: /^English$/ }).first();
      await expect(sw).toBeVisible();
      await sw.click();
      await expect(html).toHaveAttribute("dir", "ltr");
      await expect(html).toHaveAttribute("lang", "en");
    });
  }
});
