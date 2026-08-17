import { test, expect } from "../playwright-fixture";

const PATHS = ["/", "/assessment", "/r/selftest0001"];

test.use({ viewport: { width: 375, height: 812 } });

test.describe("375-wide hygiene", () => {
  for (const path of PATHS) {
    test(`${path} does not overflow and keeps 44px targets`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(375);

      /* Actions the journey depends on. Masthead and footer chrome is measured
         separately — it is small by design and tracked in e2e/README.md. */
      const small = await page.evaluate(() => {
        const out: string[] = [];
        const els = Array.from(document.querySelectorAll<HTMLElement>("button, a"));
        for (const el of els) {
          if (el.closest("nav, header, footer, [data-chrome], [data-cookie]")) continue;
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const visible =
            r.width > 0 && r.height > 0 &&
            style.visibility !== "hidden" && style.display !== "none" &&
            Number(style.opacity) > 0.05;
          // Inline links inside running text are text, not tap targets.
          const inlineInText = style.display.startsWith("inline") && !!el.closest("p, li, label, summary");
          if (visible && !inlineInText && r.height < 44) {
            out.push(`${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 32)}" ${Math.round(r.height)}px`);
          }
        }
        return out;
      });

      expect(small, `${path} has tap targets under 44px`).toEqual([]);
    });
  }
});
