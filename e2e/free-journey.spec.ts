import { readFileSync } from "node:fs";
import { test, expect } from "../playwright-fixture";

/** A public profile with enough posts to read. Override per environment. */
const PROFILE = process.env.E2E_LINKEDIN_URL || "linkedin.com/in/satyanadella";

/** The read calls a scraper and a model; it is slow by nature. */
const READ_TIMEOUT = 180_000;

/* The public backend address and publishable key, from the environment or .env.
   Both are public by design — the app ships them to every browser. */
function backend(): { url: string; key: string } {
  let url = process.env.VITE_SUPABASE_URL || "";
  let key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) {
    try {
      for (const line of readFileSync(".env", "utf8").split("\n")) {
        const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*"?([^"\n]*)"?/);
        if (m && m[1] === "VITE_SUPABASE_URL" && !url) url = m[2];
        if (m && m[1] === "VITE_SUPABASE_PUBLISHABLE_KEY" && !key) key = m[2];
      }
    } catch { /* no .env */ }
  }
  return { url, key };
}

async function rpc(fn: string, body: Record<string, unknown>) {
  const { url, key } = backend();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

type QRow = {
  id: string; position: number; kind: string; prompt: string;
  options: { label: string; value: string }[] | null; allow_none: boolean | null;
};

async function questionsFor(band: string): Promise<QRow[]> {
  const { url, key } = backend();
  const q = `select=id,position,kind,prompt,options,allow_none&band=eq.${band}&active=eq.true&sector=is.null&order=position`;
  const res = await fetch(`${url}/rest/v1/onboarding_questions?${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`onboarding_questions ${res.status}`);
  return res.json();
}

test.describe("the free journey", () => {
  /* PAID — spends ONE real read (a scraper and a model). Skip with E2E_SKIP_PAID=1. */
  test("landing → assessment → a read → onboarding [PAID: one real read]", async ({ page }) => {
    test.skip(process.env.E2E_SKIP_PAID === "1", "E2E_SKIP_PAID=1 — the paid read is skipped");
    test.slow();
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

    // Continue hands off to the real onboarding — never a second assessment.
    await page.getByRole("button", { name: /^Continue/ }).first().click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });

    // The first screen onboarding shows after a read.
    await expect(page.getByRole("heading", { name: /^This is what KnownBy can see\.?$/ }))
      .toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("progressbar", { name: /^Where you are: / }).first()).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  /* FREE — no read. A seeded anonymous session opened at the questions. */
  test("the nine questions save by code", async ({ page }) => {
    test.setTimeout(120_000);
    const BAND = "work";
    const qs = await questionsFor(BAND);
    expect(qs.length).toBe(9);

    const token: string = await rpc("create_assessment_session", {});
    expect(typeof token).toBe("string");
    const ok = await rpc("save_assessment_session", {
      p_token: token,
      p_state: { step: "onboarding", journey_screen: 11, q_idx: 0, answers: {}, profile: { seniority_band: BAND } },
    });
    expect(ok).toBe(true);

    // The proposals call is answered with nothing, so the proposed question falls
    // back to its own-words box and no model is ever called.
    await page.route("**/functions/v1/onboarding-proposals", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ options: [] }) }));

    await page.goto("/");
    await page.evaluate((t) => localStorage.setItem("aura_session_token", t), token);
    await page.goto("/onboarding");

    const heading = page.getByRole("heading", { level: 1 });
    const next = page.getByRole("button", { name: "Next", exact: true });
    const optionByLabel = (label: string) => page.getByRole("button", { name: label, exact: true });
    const atQuestion = async (q: QRow) => {
      await expect(page.getByText(new RegExp(`^Question ${q.position} of ${qs.length}$`))).toBeVisible({ timeout: 30_000 });
    };
    /* Options render in screen order (some questions shuffle); read that order. */
    const screenOrder = async (q: QRow) => {
      const labels = (q.options ?? []).map((o) => o.label);
      const pos = await Promise.all(labels.map(async (l) => (await optionByLabel(l).boundingBox())?.y ?? 0));
      return (q.options ?? []).map((o, i) => ({ ...o, y: pos[i] })).sort((a, b) => a.y - b.y);
    };

    const expected: Record<string, { values: string[]; text?: string }> = {};
    let multiSeen = 0;
    let noneUsed = false;
    let backChanged: { id: string; first: string; second: string } | null = null;

    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      await atQuestion(q);
      if (q.kind === "multi") {
        multiSeen++;
        const order = await screenOrder(q);
        if (multiSeen === 1) {
          // two picks, in reverse screen order
          const picks = [order[1].value, order[0].value];
          await optionByLabel(order[1].label).click();
          await optionByLabel(order[0].label).click();
          expected[q.id] = { values: picks };
        } else if (multiSeen === 2) {
          // picked now, changed after Back from the next question
          await optionByLabel(order[0].label).click();
          backChanged = { id: q.id, first: order[0].value, second: order[1].value };
          expected[q.id] = { values: [order[1].value] };
          await next.click();
          await atQuestion(qs[i + 1]);
          await page.getByRole("button", { name: "Back", exact: true }).click();
          await atQuestion(q);
          await optionByLabel(order[1].label).click();
        } else if (!noneUsed && q.allow_none) {
          await page.getByRole("button", { name: "None of these fit", exact: true }).click();
          expected[q.id] = { values: ["__none__"] };
          noneUsed = true;
          continue;
        } else {
          await optionByLabel(order[0].label).click();
          expected[q.id] = { values: [order[0].value] };
        }
      } else if (q.kind === "choice") {
        const order = await screenOrder(q);
        await optionByLabel(order[0].label).click();
        expected[q.id] = { values: [order[0].value] };
      } else {
        // text, and proposed in its own-words fallback
        const text = `e2e answer ${q.position}`;
        await page.getByRole("textbox").first().fill(text);
        expected[q.id] = { values: [], text };
      }
      await next.click();
    }
    expect(noneUsed, "a question offering \"None of these fit\" was answered with it").toBe(true);
    expect(backChanged).not.toBeNull();
    await expect(heading).toBeVisible();

    // Read the session back through the same public call the app loads it with.
    let state: any = null;
    await expect.poll(async () => {
      const rows = await rpc("get_assessment_session", { p_token: token });
      state = Array.isArray(rows) ? rows[0]?.state : null;
      return Object.keys(state?.answers_coded ?? {}).length;
    }, { timeout: 30_000 }).toBe(9);

    const coded = state.answers_coded as Record<string, any>;
    const legacy = state.answers as Record<string, string>;
    expect(Object.keys(coded).sort()).toEqual(qs.map((q) => q.id).sort());

    for (const q of qs) {
      const c = coded[q.id];
      const allowed = new Set([...(q.options ?? []).map((o) => o.value), "__none__"]);
      for (const v of c.values) expect(allowed.has(v), `${q.position}: ${v}`).toBe(true);
      expect(c.values).toEqual(expected[q.id].values);
      if (expected[q.id].text) expect(c.text).toBe(expected[q.id].text);
      expect(c.answered_lang).toBe("en");

      const key = `Q${q.position} ${q.prompt}`;
      expect(Object.prototype.hasOwnProperty.call(legacy, key), key).toBe(true);
      const byValue = new Map((q.options ?? []).map((o) => [o.value, o.label]));
      const want = c.values.length
        ? c.values.map((v: string) => (v === "__none__" ? "None of these fit" : byValue.get(v))).join(" · ")
        : expected[q.id].text;
      expect(legacy[key]).toBe(want);
    }
    expect(Object.keys(legacy).filter((k) => /^Q\d+ /.test(k))).toHaveLength(9);
    expect(coded[backChanged!.id].values).toEqual([backChanged!.second]);
  });
});
