/* The base fixture comes from the Lovable harness when it is available.
   Outside the harness the specs fall back to plain @playwright/test, so the
   same files run locally and in CI. Override or extend test/expect here. */
import { createRequire } from "node:module";
import * as base from "@playwright/test";

let mod: { test: typeof base.test; expect: typeof base.expect } = base;
try {
  const require_ = createRequire(import.meta.url);
  mod = require_("lovable-agent-playwright-config/fixture");
} catch {
  /* not inside the harness */
}

export const test = mod.test;
export const expect = mod.expect;
