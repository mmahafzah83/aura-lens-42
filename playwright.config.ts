import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import { createRequire } from "node:module";

const BASE_URL =
  process.env.E2E_BASE_URL || "https://id-preview--ebcdc7ac-e312-488b-8661-90ceb9c5c745.lovable.app";

const overrides: PlaywrightTestConfig = {
  testDir: "./e2e",
  retries: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Escape hatch for sandboxes that already carry a Chromium build.
    ...(process.env.E2E_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } }
      : {}),
  },
};

/* The Lovable harness supplies `lovable-agent-playwright-config`. It is the base
   whenever it is present; outside the harness we fall back to a plain config so
   `npm run test:e2e` still walks the same specs. */
let config: PlaywrightTestConfig;
try {
  const require_ = createRequire(import.meta.url);
  const { createLovableConfig } = require_("lovable-agent-playwright-config/config");
  config = createLovableConfig(overrides);
} catch {
  config = defineConfig(overrides);
}

export default config;
