import { describe, expect, it, vi } from "vitest";
import { TEMPLATES, getTemplate } from "../render/template";

describe("gate derivation", () => {
  it("gates a font introduced by a new descriptor with no manual SPECS edit", async () => {
    const base = getTemplate("instrument");
    (TEMPLATES as Record<string, unknown>).tmp_poppins = {
      ...base,
      id: "tmp_poppins",
      fonts: {
        ...base.fonts,
        displayEn: '"AuraPoppins", sans-serif',
        gateSpecs: [['700 92px "AuraPoppins"', "AGMTW"]],
      },
    };
    const loads: string[] = [];
    (globalThis as any).document = {
      fonts: {
        load: (s: string) => { loads.push(s); return Promise.resolve([]); },
        ready: Promise.resolve(),
      },
    };
    const { ensureCarouselFonts } = await import("../render/fontsReady");
    await ensureCarouselFonts();
    delete (TEMPLATES as Record<string, unknown>).tmp_poppins;
    console.log("LOADED SPECS:", JSON.stringify(loads, null, 0));
    expect(loads).toContain('700 92px "AuraPoppins"');
    expect(loads).toContain('400 150px "AuraAnton"');
  });
});
