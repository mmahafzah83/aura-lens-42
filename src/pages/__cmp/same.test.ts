import { it, expect } from "vitest";
import { LANDING_V2_HTML } from "./Old";
import { landingHtml, landingStrings } from "../LandingV2";
it("english identical", () => { expect(landingHtml(landingStrings("en"), false)).toBe(LANDING_V2_HTML); });
it("arabic ok", () => { const h = landingHtml(landingStrings("ar"), true); expect(h).not.toContain("undefined"); });
