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

/**
 * What the member can show, read off his own record. Used to test a stated
 * requirement against evidence rather than against a band he once mentioned.
 */
export type Evidence = {
  years_experience?: number | null;
  practice?: string | null;
  sectors?: string[] | null;
  faces_text?: string | null;
};

/**
 * Three outcomes and three only.
 *  excluded — the record states a mandatory requirement he demonstrably
 *             cannot meet.
 *  unknown  — the requirement cannot be established. Marked, never excluded.
 *  eligible — including a stretch above his current title.
 */
export type Outcome = "excluded" | "unknown" | "eligible";
export type Screened = {
  pass: boolean;
  fails: string[];
  outcome: Outcome;
  unknowns: string[];
  /**
   * Things the member should see and decide on, which do NOT close the record.
   * A conference panel in Dubai is not a reason to hide the panel from a man
   * in Riyadh; it is a distance he can weigh.
   */
  conditions: string[];
};


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
 *
 * This ladder is the ONLY level vocabulary. oe_opportunities.seniority_band
 * holds a different vocabulary entirely (work/table/room, a chair grouping);
 * it must never reach this screen. The parsed ladder lives in level_band.
 */
const LEVEL_PATTERNS: Array<[RegExp, Level]> = [
  [/board (nomination|member|seat|directorship)|nomination (for|of) (the )?board|non-?executive director|عضوية مجلس|الترشح لعضوية مجلس|عضو مجلس إدارة/i, "board"],
  [/\bchief\s|^ceo\b|\bceo\b|^cfo\b|\bcfo\b|^coo\b|\bcoo\b|\bcto\b|group c[fe]o|president\b|رئيس تنفيذي|الرئيس التنفيذي|المدير العام التنفيذي/i, "c_suite"],
  [/managing director|general manager|\bvp\b|vice president|نائب رئيس|المدير العام/i, "vp"],
  [/senior director|head of|رئيس قطاع|رئيس قسم|مدير تنفيذي أول/i, "senior_director"],
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

/**
 * NATIONALITY — any stated citizenship requirement, in either language, not
 * just the Saudi one. Each entry maps a phrase to the country code that
 * satisfies it; a member whose nationality is not that code cannot meet it.
 */
const NATIONALITY_PATTERNS: Array<[RegExp, string]> = [
  [/saudi national|saudi citizen|saudi nationality|nationals? of saudi|سعودي الجنسية|سعودي الجنسيه|مواطن سعودي|الجنسية السعودية|السعوديين فقط|للسعوديين/i, "SA"],
  [/uae national|emirati|u\.?a\.?e\.? citizen|nationals? of the u\.?a\.?e|إماراتي الجنسية|مواطن إماراتي|الجنسية الإماراتية/i, "AE"],
  [/qatari (national|citizen)|nationals? of qatar|قطري الجنسية|مواطن قطري|الجنسية القطرية/i, "QA"],
  [/kuwaiti (national|citizen)|كويتي الجنسية|مواطن كويتي/i, "KW"],
  [/bahraini (national|citizen)|بحريني الجنسية|مواطن بحريني/i, "BH"],
  [/omani (national|citizen)|عماني الجنسية|مواطن عماني/i, "OM"],
  [/jordanian (national|citizen)|أردني الجنسية|مواطن أردني/i, "JO"],
  [/gcc national|gcc citizen|مواطني دول مجلس التعاون|خليجي الجنسية/i, "GCC"],
  [/citizens only|nationals only|must be a citizen|must hold .{0,20}citizenship|مواطنون فقط|يشترط الجنسية|حاملي الجنسية/i, "*"],
];

const GCC = ["SA", "AE", "QA", "KW", "BH", "OM"];

/**
 * A title is not a requirements list. "Saudi National Water Strategy" names a
 * document; "Head of Procurement - UAE National" states a requirement. In a
 * title or scope the phrase only counts when it is set off as a qualifier —
 * in brackets, after a dash or comma, at the end, or spelled out as a demand.
 */
const QUALIFIER_LEFT = /[\-–—(\[,/|:]\s*$|\b(only|must be|open to|restricted to|candidates?|applicants?|يشترط|فقط)\s*$/i;
const QUALIFIER_RIGHT = /^\s*[)\]\-–—,/|.]|^\s*(only|candidates?|applicants?|required|فقط)\b|^\s*$/i;

/**
 * The first stated nationality requirement the member does not satisfy, with
 * the phrase that stated it. Null when nothing is stated or he satisfies it.
 * '*' means a citizenship is demanded without naming one — unknown, not a fail.
 * `loose` is for a requirements array, where every line is already a demand.
 */
export function nationalityMismatch(
  text: string,
  nationality: string,
  loose = true,
): { phrase: string; wants: string } | null {
  for (const [re, wants] of NATIONALITY_PATTERNS) {
    const global = new RegExp(re.source, "gi");
    let hit: RegExpExecArray | null;
    while ((hit = global.exec(text))) {
      if (!loose) {
        const before = text.slice(0, hit.index);
        const after = text.slice(hit.index + hit[0].length);
        if (!(QUALIFIER_LEFT.test(before) && QUALIFIER_RIGHT.test(after))) continue;
      }
      const satisfied = wants === nationality || (wants === "GCC" && GCC.includes(nationality));
      if (satisfied) break;
      return { phrase: hit[0], wants };
    }
  }
  return null;
}


const PRIOR_BOARD_RE = /prior board|previous board (service|experience)|served on a board|existing board member|سبق له عضوية مجلس|خبرة سابقة في مجالس/i;
const MANDATORY_RE = /\bmust\b|\brequired\b|\bmandatory\b|\bminimum\b|يشترط|إلزامي|يجب/i;
const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:years|yrs|سنة|سنوات)/i;

const requirementTexts = (o: any): string[] =>
  (Array.isArray(o?.requirements) ? o.requirements : [])
    .map((r: any) => (typeof r === "string" ? r : String(r?.text ?? "")))
    .filter(Boolean);


/**
 * THE SCREEN — profile against stated requirement, never a band he set.
 *
 * Place and a seat kind he has ruled out still close a record. Everything else
 * is a test of what the record asks for against what his own record shows. A
 * requirement we cannot establish is unknown: it is marked and queued, and it
 * does NOT exclude. Seniority is not tested at all any more; a role above his
 * current title is eligible when he meets its stated experience and scope.
 */
export function screen(
  opportunity: any,
  eligibility: Eligibility | null | undefined,
  evidence?: Evidence | null,
): Screened {
  const fails: string[] = [];
  const unknowns: string[] = [];
  const conditions: string[] = [];
  const done = (): Screened => {
    const outcome: Outcome = fails.length ? "excluded" : unknowns.length ? "unknown" : "eligible";
    // Unknown never excludes. Only a demonstrated exclusion closes a record.
    return {
      pass: outcome !== "excluded",
      fails: [...new Set(fails)],
      outcome,
      unknowns: [...new Set(unknowns)],
      conditions: [...new Set(conditions)],
    };
  };
  if (!eligibility) return done();

  const o = opportunity ?? {};

  // 1. PLACE — and place does not mean the same thing to every kind of record.
  //
  // A full-time executive seat is location-hard: the wrong city closes it. A
  // speaking platform, a membership, a paper, a market signal are location-
  // irrelevant. A board seat that meets quarterly, a tender, a teaching slot
  // sit in between: the distance is a condition he can weigh, never a reason
  // to hide the record from him. The sensitivity is read off the kind's own
  // catalogue row, never guessed here.
  const sensitivity = String(o.location_sensitivity ?? "hard").toLowerCase();
  const allowed = (eligibility.countries_allowed ?? []).map((c) => String(c).toUpperCase());
  if (allowed.length && sensitivity !== "none") {
    const explicitlyRemote = o.remote === true || REMOTE_RE.test(String(o.location ?? o.title ?? ""));
    if (!(explicitlyRemote && eligibility.remote_ok === true)) {
      const country = countryOfPlace(o.location);
      if (!country) {
        if (sensitivity === "hard") unknowns.push("place_unknown");
      } else if (!allowed.includes(country)) {
        if (sensitivity === "hard") fails.push("place");
        else conditions.push(`place_distance: ${String(o.location ?? country)}`);
      }
    }
  }

  // 2. CHAIR — a kind of seat he has ruled out, ratified as a rule.
  const blocked = (eligibility.chair_types_blocked ?? []).map((c) => String(c).toLowerCase());
  const chair = String(o.chair_type ?? "").toLowerCase();
  if (chair && blocked.includes(chair)) fails.push("chair");

  // 3. REQUIREMENT versus EVIDENCE.
  const nationality = String(eligibility.nationality ?? "").toUpperCase();
  const neverHeld = (eligibility.chair_types_never_held ?? []).map((c) => String(c).toLowerCase());
  const years = typeof evidence?.years_experience === "number" ? evidence.years_experience : null;

  // NATIONALITY — read off the whole record, not the requirements array alone.
  // A title is where this is stated most often ("Head of Procurement - UAE
  // National"), so the title and the scope are searched too.
  const reqLines = requirementTexts(o);
  const natHit =
    (reqLines.length
      ? nationalityMismatch(reqLines.join(" \u2022 "), nationality || "__none__", true)
      : null) ??
    nationalityMismatch(
      [o.title, o.scope].filter(Boolean).join(" \u2022 "),
      nationality || "__none__",
      false,
    );
  if (natHit) {
    if (!nationality || natHit.wants === "*") unknowns.push(`requirement_nationality: ${natHit.phrase}`);
    else fails.push(`requirement_nationality: ${natHit.phrase}`);
  }


  for (const text of requirementTexts(o)) {
    if (PRIOR_BOARD_RE.test(text)) {
      if (neverHeld.includes("board")) { fails.push("requirement_prior_board"); continue; }
      unknowns.push("requirement_prior_board");
      continue;
    }
    const asked = YEARS_RE.exec(text);
    if (asked) {
      const wanted = Number(asked[1]);
      if (years === null) unknowns.push("requirement_years");
      else if (Number.isFinite(wanted) && wanted > years) fails.push("requirement_years");
      continue;
    }
    // Something stated as mandatory that no test of ours can establish.
    if (MANDATORY_RE.test(text)) unknowns.push("requirement_unestablished");
  }


  return done();
}

/**
 * The route kinds that count as a real door. A named person counts as a door
 * when the page is the issuer's own and names someone specific.
 */
export const OPEN_ROUTE_KINDS = ["application", "contact", "named_person", "call_for_speakers", "registration"];

/** A site-root contact or about page is a wall, not a door. */
const GENERIC_ROUTE_PATH = /^\/?(contact|contact-us|contactus|get-in-touch|about|about-us|اتصل-بنا|اتصل|من-نحن)\/?$/i;

const hostOf = (url?: string | null): string | null => {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
};

const sameSite = (a: string, b: string): boolean =>
  a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/**
 * The ladder level a record asks for. It is a RANKING input only — it feeds
 * the build and explore purposes and never excludes anything.
 */
export function levelOf(o: any): Level | null {
  const stored = String(o?.level_band ?? "").trim();
  if (LEVELS.includes(stored as Level)) return stored as Level;
  return parseLevel(o?.title, o?.scope);
}


/**
 * A real door. `contact` and `named_person` count only when the page belongs
 * to the issuer's own site and points at something more specific than its
 * front-door contact page; anything else is a wall a member would tap into
 * nothing.
 */
export function hasRoute(o: any, issuerDomain?: string | null): boolean {
  if (!o?.route_url || o?.route_dead === true) return false;
  const kind = String(o?.route_kind ?? "");
  if (!OPEN_ROUTE_KINDS.includes(kind)) return false;
  if (kind !== "contact" && kind !== "named_person") return true;

  const host = hostOf(o.route_url);
  if (!host) return false;

  const issuer = String(issuerDomain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!issuer || !sameSite(host, issuer)) return false;

  let path = "/";
  try { path = new URL(String(o.route_url)).pathname; } catch { return false; }
  if (GENERIC_ROUTE_PATH.test(decodeURIComponent(path))) return false;
  return true;
}

/** 'act' when he can both hold it and reach it; otherwise 'write'. */
export function laneFor(o: any, screened: Screened, issuerDomain?: string | null): "act" | "write" {
  return screened.pass && hasRoute(o, issuerDomain) ? "act" : "write";
}
