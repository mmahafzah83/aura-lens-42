import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import ar from "@/i18n/locales/ar.json";
import { SECTORS, sectorLabel } from "@/constants/sectors";
import { titleLabel, bandOfTitle } from "@/lib/seniorityTitles";

const AR = ar as Record<string, string>;
const ACTIVE_TITLES = [
  "Founder", "C-Suite", "Board Member", "SVP / EVP", "VP", "Dean", "Professor", "Partner",
  "Senior Director", "Director", "Senior Manager", "Principal / Fellow", "Advisor",
  "Head of Department", "Associate Professor", "Assistant Professor", "Manager",
  "Senior Consultant", "Consultant", "Analyst / Associate", "Specialist / Engineer",
  "Lecturer / Researcher", "Other",
];

describe("sector and level Arabic", () => {
  it("every sector has Arabic, and the stored value stays English", () => {
    for (const s of SECTORS) {
      expect(AR[`sector.${s}`], s).toMatch(/[\u0600-\u06FF]/);
      expect(sectorLabel(s, (k) => AR[k] ?? k)).toBe(AR[`sector.${s}`]);
      expect(sectorLabel(s, (k) => k)).toBe(s);
    }
  });

  it("every active title has Arabic in the migration", () => {
    const sql = readFileSync("drizzle/migrations/0004_seniority_titles_arabic.sql", "utf8");
    for (const t of ACTIVE_TITLES) {
      const esc = t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      expect(sql, t).toMatch(new RegExp(`\\('${esc}','[\\u0600-\\u06FF][^']*'\\)`));
    }
  });

  it("titleLabel falls back to English; matching stays on English", () => {
    const row = { title: "Director", title_ar: "مدير إدارة", band: "table" as const, position: 1 };
    expect(titleLabel(row, "ar")).toBe("مدير إدارة");
    expect(titleLabel(row, "en")).toBe("Director");
    expect(titleLabel({ title: "VP", title_ar: "" }, "ar")).toBe("VP");
    expect(bandOfTitle([row], "Director")).toBe("table");
  });
});
