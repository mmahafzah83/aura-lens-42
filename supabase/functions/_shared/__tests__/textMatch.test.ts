import { describe, expect, it } from "vitest";
import {
  buildAliasIndex,
  expandWithAliases,
  isSafeAlias,
  normaliseArabic,
  normaliseText,
  stemToken,
  tokenise,
  EMPTY_ALIASES,
} from "../textMatch";
import { buildHaystacks, matchTheme } from "@/lib/themeMatch";

const SEED = [
  { canonical: "artificial intelligence", alias: "ai" },
  { canonical: "machine learning", alias: "ml" },
  { canonical: "الذكاء الاصطناعي", alias: "ai", locale: "ar" },
];
const ALIASES = buildAliasIndex(SEED);

const profile = (over: Record<string, unknown> = {}) => ({
  headline: "Chief transformation officer",
  about:
    "I work on subjects such as AI governance, generative ai, operating models, operational efficiencies and growth, and change management.",
  experience: [{ position: "Head of delivery", description: "Ran the airport programme" }],
  skills: ["Operating models", "Governance"],
  ...over,
});

describe("stemming", () => {
  it("efficiencies stems to efficiency", () => {
    expect(stemToken("efficiencies")).toBe("efficiency");
  });
  it("models stems to model", () => {
    expect(stemToken("models")).toBe("model");
  });
  it("analysis is left alone", () => {
    expect(stemToken("analysis")).toBe("analysis");
  });
  it("short tokens are never stemmed", () => {
    expect(stemToken("ais")).toBe("ais");
  });
  it("boxes stems to box", () => {
    expect(stemToken("boxes")).toBe("box");
  });
  it("Arabic tokens are never English-stemmed", () => {
    expect(stemToken("الحوكمة")).toBe("الحوكمة");
    expect(stemToken(normaliseText("الحوكمة"))).toBe(normaliseText("الحوكمة"));
  });
});

describe("Arabic normalising", () => {
  it("strips harakat and tatweel and folds alef", () => {
    expect(normaliseArabic("الْحَوْكَمَة")).toBe(normaliseText("الحوكمه"));
    expect(normaliseText("إدارة التغيير")).toBe(normaliseText("ادارە التغيير").replace("ە", "ه"));
  });
  it("a theme with harakat matches the same word without", () => {
    const hay = buildHaystacks({ headline: "الحوكمة", about: "", experience: [], skills: [] });
    expect(matchTheme(hay, "الْحَوْكَمَة").state).toBe("carried");
  });
});

describe("alias safety", () => {
  it("rejects stopword aliases such as it", () => {
    expect(isSafeAlias({ canonical: "information technology", alias: "it" })).toBe(false);
  });
  it("a profile containing the word it does not match information technology", () => {
    const hay = buildHaystacks({ headline: "It is what it is", about: "", experience: [], skills: [] });
    expect(matchTheme(hay, "information technology", buildAliasIndex([{ canonical: "information technology", alias: "it" }])).state).toBe("missing");
  });
  it("alias resolution is one hop and terminates", () => {
    const chain = buildAliasIndex([
      { canonical: "a1 b1", alias: "c1" },
      { canonical: "c1", alias: "d1" },
    ]);
    const out = expandWithAliases(new Set(tokenise("a1 b1").stems), chain);
    expect(out.has("c1")).toBe(true);
    expect(out.has("d1")).toBe(false);
  });
});

describe("theme matching", () => {
  it("operational efficiencies carries the theme operational efficiency", () => {
    expect(matchTheme(buildHaystacks(profile()), "operational efficiency", ALIASES).state).toBe("carried");
  });
  it("AI in About carries the theme artificial intelligence", () => {
    expect(matchTheme(buildHaystacks(profile()), "artificial intelligence", ALIASES).state).toBe("carried");
  });
  it("ai governance is carried", () => {
    expect(matchTheme(buildHaystacks(profile()), "ai governance", ALIASES).state).toBe("carried");
  });
  it("risk management is missing", () => {
    expect(matchTheme(buildHaystacks(profile()), "risk management", ALIASES).state).toBe("missing");
  });
  it("airport does not match the theme ai", () => {
    const hay = buildHaystacks({ headline: "Airport programmes", about: "airports", experience: [], skills: [] });
    expect(matchTheme(hay, "ai", EMPTY_ALIASES).state).toBe("missing");
  });
  it("a listed-only subject is partial, never carried", () => {
    const hay = buildHaystacks({
      headline: "Chief operating officer",
      about: "I write about delivery.",
      experience: [{ position: "Head of governance" }],
      skills: [],
    });
    const m = matchTheme(hay, "governance", ALIASES);
    expect(m.state).toBe("partial");
    expect(m.listedOnly).toBe(true);
  });
  it("some tokens found is partial", () => {
    const hay = buildHaystacks({ headline: "Governance lead", about: "", experience: [], skills: [] });
    expect(matchTheme(hay, "data governance", ALIASES).state).toBe("partial");
  });
  it("no aliases still matches exactly — the table-read failure path", () => {
    expect(matchTheme(buildHaystacks(profile()), "artificial intelligence", EMPTY_ALIASES).state).toBe("missing");
    expect(() => matchTheme(buildHaystacks(profile()), "artificial intelligence")).not.toThrow();
    expect(buildAliasIndex(null).pairs).toHaveLength(0);
  });
});
