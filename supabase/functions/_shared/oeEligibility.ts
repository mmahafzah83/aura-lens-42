/**
 * THE ELIGIBILITY GATE — what a member cannot hold, decided in code.
 *
 * A score says how well someone fits. It has no way of saying "this seat is
 * closed to him", and so the engine kept offering seats that are closed. This
 * file is the missing idea: four deterministic screens, no model, run before
 * anything expensive. A record that fails here is never sent to the reader —
 * it goes to the writing lane instead, which is not a rejection.
 *
 * Nothing here is inferred about a person. Every rule comes from a row the
 * member wrote himself in oe_eligibility.
 */

export type Eligibility = {
  nationality?: string | null;
  residence_country?: string | null;
  countries_allowed?: string[] | null;
  remote_ok?: boolean | null;
  level_now?: string | null;
  level_ceiling?: string | null;
  level_floor?: string | null;
  chair_types_never_held?: string[] | null;
  chair_types_blocked?: string[] | null;
  blocked_reasons?: Record<string, string> | null;
  sectors_core?: string[] | null;
};

export type Screened = { pass: boolean; fails: string[] };

/** The ladder. Order is the whole point; an index is a level. */
export const LEVELS = [
  "ic", "manager", "senior_manager", "director",
  "senior_director", "vp", "c_suite", "board",
] as const;
export type Level = typeof LEVELS[number];

export const levelIndex = (level?: string | null): number =>
  LEVELS.indexOf(String(level ?? "").trim() as Level);

/**
 * Places, in both languages, mapped to the country they belong to. A city is
 * as good as a country name; anything we cannot place is unknown, never fine.
 */
const PLACES: Array<[RegExp, string]> = [
  [/saudi|k\.?s\.?a\b|riyadh|jeddah|jiddah|dammam|khobar|dhahran|makkah|mecca|madinah|medina|neom|yanbu|jubail|abha|tabuk|qassim|hail|jazan|السعودي|الرياض|جدة|الدمام|الخبر|الظهران|مكة|المدينة|نيوم|ينبع|الجبيل|أبها|تبوك|القصيم|حائل|جازان/i, "SA"],
  [/\bu\.?a\.?e\b|emirat|dubai|abu dhabi|sharjah|ajman|الإمارات|دبي|أبوظبي|الشارقة|عجمان/i, "AE"],
  [/qatar|doha|قطر|الدوحة/i, "QA"],
  [/kuwait|الكويت/i, "KW"],
  [/bahrain|manama|البحرين|المنامة/i, "BH"],
  [/\boman\b|muscat|سلطنة عمان|مسقط/i, "OM"],
  [/jordan|amman|الأردن|عمّان/i, "JO"],
  [/egypt|cairo|مصر|القاهرة/i, "EG"],
  [/lebanon|beirut|لبنان|بيروت/i, "LB"],
  [/iraq|baghdad|العراق|بغداد/i, "IQ"],
  [/\buk\b|united kingdom|london|بريطانيا|لندن/i, "GB"],
  [/united states|\bu\.?s\.?a?\b|new york|washington|أمريكا|واشنطن/i, "US"],
  [/france|paris|فرنسا|باريس/i, "FR"],
  [/germany|berlin|ألمانيا|برلين/i, "DE"],
  [/switzerland|geneva|zurich|سويسرا|جنيف/i, "CH"],
  [/singapore|سنغافورة/i, "SG"],
  [/india|delhi|mumbai|الهند/i, "IN"],
  [/pakistan|islamabad|باكستان/i, "PK"],
  [/turkey|türkiye|istanbul|تركيا|إسطنبول/i, "TR"],
];

const REMOTE_RE = /\bremote\b|work from home|عن بعد|من المنزل/i;

/** The country a place belongs to, or null when we cannot tell. */
export function countryOfPlace(location?: string | null): string | null {
  const text = String(location ?? "").trim();
  if (!text) return null;
  for (const [re, code] of PLACES) if (re.test(text)) return code;
  const bare = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (bare.length === 2) return bare;
  return null;
}

/**
 * The level a record asks for, read off its own words. Ordered, because
 * "senior director" must be seen before "director". Unmatched is null, and a
 * null never fails the level screen — we do not punish silence.
 */
const LEVEL_PATTERNS: Array<[RegExp, Level]> = [
  [/board (nomination|member|seat|directorship)|nomination (for|of) (the )?board|non-?executive director|عضوية مجلس|الترشح لعضوية مجلس|عضو مجلس إدارة/i, "board"],
  [/\bchief\s|^ceo\b|\bceo\b|^cfo\b|\bcfo\b|^coo\b|\bcoo\b|\bcto\b|group c[fe]o|president\b|الرئيس التنفيذي|المدير العام التنفيذي/i, "c_suite"],
  [/managing director|general manager|\bvp\b|vice president|نائب رئيس|المدير العام/i, "vp"],
  [/senior director|head of|رئيس قسم|مدير تنفيذي أول/i, "senior_director"],
  [/\bdirector\b|مدير تنفيذي/i, "director"],
  [/senior manager|مدير أول/i, "senior_manager"],
  [/\bmanager\b|\blead\b|مدير/i, "manager"],
  [/consultant|analyst|associate|specialist|engineer|استشاري|محلل|أخصائي|مهندس/i, "ic"],
];

/** Reads a level out of a title and scope. Code, never a model. */
export function parseLevel(title?: string | null, scope?: string | null): Level | null {
  const text = `${title ?? ""} ${scope ?? ""}`;
  if (!text.trim()) return null;
  for (const [re, level] of LEVEL_PATTERNS) if (re.test(text)) return level;
  return null;
}

const NATIONALITY_RE = /saudi national|saudi citizen|saudi nationality|سعودي الجنسية|مواطن سعودي|السعوديين فقط/i;
const PRIOR_BOARD_RE = /prior board|previous board (service|experience)|served on a board|existing board member|سبق له عضوية مجلس|خبرة سابقة في مجالس/i;

const requirementTexts = (o: any): string[] =>
  (Array.isArray(o?.requirements) ? o.requirements : [])
    .map((r: any) => (typeof r === "string" ? r : String(r?.text ?? "")))
    .filter(Boolean);

/**
 * The four screens, in order. Returns every code that failed, because a member
 * is owed the whole reason and not just the first one.
 */
export function screen(opportunity: any, eligibility: Eligibility | null | undefined): Screened {
  const fails: string[] = [];
  if (!eligibility) return { pass: true, fails };

  const o = opportunity ?? {};

  // 1. PLACE — where he can actually work.
  const allowed = (eligibility.countries_allowed ?? []).map((c) => String(c).toUpperCase());
  if (allowed.length) {
    const explicitlyRemote = o.remote === true || REMOTE_RE.test(String(o.location ?? o.title ?? ""));
    if (!(explicitlyRemote && eligibility.remote_ok === true)) {
      const country = countryOfPlace(o.location);
      if (!country) fails.push("place_unknown");
      else if (!allowed.includes(country)) fails.push("place");
    }
  }

  // 2. CHAIR — a kind of seat he has told us is closed.
  const blocked = (eligibility.chair_types_blocked ?? []).map((c) => String(c).toLowerCase());
  const chair = String(o.chair_type ?? "").toLowerCase();
  if (chair && blocked.includes(chair)) fails.push("chair");

  // 3. LEVEL — above his ceiling or below his floor.
  const asked = (o.seniority_band && LEVELS.includes(String(o.seniority_band) as Level))
    ? (String(o.seniority_band) as Level)
    : parseLevel(o.title, o.scope);
  if (asked) {
    const i = levelIndex(asked);
    const ceiling = levelIndex(eligibility.level_ceiling);
    const floor = levelIndex(eligibility.level_floor);
    if (ceiling >= 0 && i > ceiling) fails.push("level");
    else if (floor >= 0 && i < floor) fails.push("level");
  }

  // 4. REQUIREMENT — something asked of a person that he cannot satisfy.
  const nationality = String(eligibility.nationality ?? "").toUpperCase();
  const neverHeld = (eligibility.chair_types_never_held ?? []).map((c) => String(c).toLowerCase());
  for (const text of requirementTexts(o)) {
    if (NATIONALITY_RE.test(text) && nationality && nationality !== "SA") {
      fails.push("requirement");
      break;
    }
    if (PRIOR_BOARD_RE.test(text) && neverHeld.includes("board")) {
      fails.push("requirement");
      break;
    }
  }

  return { pass: fails.length === 0, fails: [...new Set(fails)] };
}

/** The route kinds that count as a real door. */
export const OPEN_ROUTE_KINDS = ["application", "contact", "call_for_speakers", "registration"];

export function hasRoute(o: any): boolean {
  return !!o?.route_url && o?.route_dead !== true &&
    OPEN_ROUTE_KINDS.includes(String(o?.route_kind ?? ""));
}

/** 'act' when he can both hold it and reach it; otherwise 'write'. */
export function laneFor(o: any, screened: Screened): "act" | "write" {
  return screened.pass && hasRoute(o) ? "act" : "write";
}
