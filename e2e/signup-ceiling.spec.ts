import { test, expect } from "../playwright-fixture";

/**
 * The front door at N-1, N and N+1.
 *
 * The ceiling itself lives in supabase/functions/_shared/limits.ts and is the
 * only place a number is defined. Burning real accounts to reach it would be
 * absurd, so the counter is seeded here: the signup function is mocked to
 * answer as it does at each side of the boundary, and what is asserted is the
 * sentence the person actually reads.
 */

const LIMIT_SENTENCE =
  "That is as many accounts as can be opened from this network today. It lifts in 24 hours. Write to support@aura-intel.org and it is sorted by hand in the meantime.";

const TOKEN = "e2e-ceiling-token";

/** The anonymous run the wall sits at the end of. */
const SESSION_ROW = [
  {
    state: {
      step: "read_open",
      profile_url: "linkedin.com/in/example",
      journey_screen: 13,
      answers: {},
      read: { archetype: "The Operator", honest_gap: "A gap" },
    },
    runs_started: 1,
    created_at: new Date().toISOString(),
  },
];

/** Seeds the counter: `attempt` is which account opening this is. */
async function openTheWall(page: import("@playwright/test").Page, attempt: number, ceiling: number) {
  await page.route("**/rest/v1/rpc/get_assessment_session*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SESSION_ROW) }),
  );
  await page.route("**/rest/v1/rpc/save_assessment_session*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "true" }),
  );

  // The mocked counter. At or beyond the ceiling the door is shut.
  await page.route("**/functions/v1/auth-signup", (route) => {
    const body =
      attempt > ceiling
        ? { ok: false, code: "signup_limit", error: LIMIT_SENTENCE }
        : { ok: true, existing: false };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  // Sign-in is out of scope here; refuse it so the wall shows its own outcome.
  await page.route("**/auth/v1/token*", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "e2e" }) }),
  );

  await page.addInitScript(
    ([token]) => {
      localStorage.setItem("aura_session_token", token as string);
      localStorage.setItem("aura_ob_screen_anon", "13");
    },
    [TOKEN],
  );

  await page.goto("/onboarding");
  await expect(page.locator("#ob-wall-email")).toBeVisible({ timeout: 30_000 });
}

async function submit(page: import("@playwright/test").Page) {
  await page.locator("#ob-wall-email").fill(`e2e-${Date.now()}@example.com`);
  await page.locator("#ob-wall-pwd").fill("a-long-enough-password");
  await page.locator("#ob-wall-consent").check();
  await page.getByRole("button", { name: /keep|save|account|open/i }).first().click();
}

const CEILING = 100;

test.describe("the signup ceiling", () => {
  test("N-1 — the door opens and no refusal is shown", async ({ page }) => {
    await openTheWall(page, CEILING - 1, CEILING);
    await submit(page);
    await expect(page.getByText(LIMIT_SENTENCE)).toHaveCount(0);
    await expect(page.getByText(/in a moment/i)).toHaveCount(0);
    await expect(page.getByText(/Your account is open/i)).toBeVisible({ timeout: 20_000 });
  });

  test("N — the last account still opens", async ({ page }) => {
    await openTheWall(page, CEILING, CEILING);
    await submit(page);
    await expect(page.getByText(LIMIT_SENTENCE)).toHaveCount(0);
    await expect(page.getByText(/Your account is open/i)).toBeVisible({ timeout: 20_000 });
  });

  test("N+1 — the refusal says exactly what happened", async ({ page }) => {
    await openTheWall(page, CEILING + 1, CEILING);
    await submit(page);
    const shown = page.getByText(LIMIT_SENTENCE);
    await expect(shown).toBeVisible({ timeout: 20_000 });
    // The generic sentence must never stand in for a 24-hour block.
    await expect(page.getByText(/in a moment/i)).toHaveCount(0);
    await expect(page.getByText(/Couldn't open the account just now/i)).toHaveCount(0);
    await expect(page.getByText(/signup_limit/i)).toHaveCount(0);
  });
});
