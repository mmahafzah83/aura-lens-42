import { supabase } from "@/integrations/supabase/client";

/**
 * THE REFERENCE LISTS ARE THE LABELS.
 *
 * A place, a level, a sector, a kind — each is a code in the database and a
 * word in two languages in its own reference table. Nothing here names a
 * country or a sector: the tables do. A code with no row shows as itself
 * rather than as a guess.
 */

type Row = { code: string; en: string; ar: string };

const TABLES: Record<string, { table: string; key: string; en: string; ar: string }> = {
  place: { table: "oe_ref_countries", key: "iso2", en: "name_en", ar: "name_ar" },
  nationality: { table: "oe_ref_countries", key: "iso2", en: "name_en", ar: "name_ar" },
  region: { table: "oe_ref_regions", key: "code", en: "name_en", ar: "name_ar" },
  sector: { table: "oe_ref_sectors", key: "code", en: "name_en", ar: "name_ar" },
  level: { table: "oe_ref_levels", key: "code", en: "name_en", ar: "name_ar" },
  org_type: { table: "oe_ref_org_types", key: "code", en: "name_en", ar: "name_ar" },
  engagement: { table: "oe_ref_engagements", key: "code", en: "name_en", ar: "name_ar" },
  kind: { table: "oe_opportunity_kinds", key: "code", en: "label_en", ar: "label_ar" },
};

const cache: Record<string, Record<string, Row>> = {};
const inflight: Record<string, Promise<Record<string, Row>>> = {};

async function load(field: string): Promise<Record<string, Row>> {
  const spec = TABLES[field];
  if (!spec) return {};
  if (cache[spec.table]) return cache[spec.table];
  if (!inflight[spec.table]) {
    inflight[spec.table] = (async () => {
      const { data } = await (supabase.from(spec.table as any) as any)
        .select(`${spec.key}, ${spec.en}, ${spec.ar}`);
      const map: Record<string, Row> = {};
      for (const row of data ?? []) {
        const code = String(row[spec.key]);
        map[code.toUpperCase()] = { code, en: String(row[spec.en] ?? code), ar: String(row[spec.ar] ?? code) };
      }
      cache[spec.table] = map;
      return map;
    })();
  }
  return await inflight[spec.table];
}

/** Warms every list the tab can show, so a label never arrives late. */
export async function loadRefLabels(): Promise<void> {
  await Promise.all(Object.keys(TABLES).map((f) => load(f)));
}

/** The word for a code, in this language. Falls back to the code itself. */
export function refLabel(field: string, value: string, lang: "en" | "ar"): string {
  const spec = TABLES[field];
  if (!spec) return value;
  const row = cache[spec.table]?.[String(value ?? "").toUpperCase()];
  return row ? row[lang] : value;
}

/**
 * The ordinal a member reads: 1st, 2nd, 3rd, 4th. Arabic states the numeral
 * plainly — it takes no ordinal suffix here — so the number is returned as is.
 */
export function ordinal(n: number, lang: "en" | "ar"): string {
  if (lang === "ar") return String(n);
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${n % 10 >= 1 && n % 10 <= 3 ? suffix : "th"}`;
}

/**
 * The way in, read from the address itself — an agency, an applicant system,
 * the organisation's own site, or unknown. The sentence for each class lives
 * in the vocabulary; this only says which class it is.
 */
const ATS_HOSTS = [
  "myworkdayjobs.com", "workday.com", "taleo.net", "successfactors.com", "icims.com",
  "greenhouse.io", "lever.co", "smartrecruiters.com", "oraclecloud.com", "brassring.com",
  "ashbyhq.com", "workable.com", "bamboohr.com", "jobvite.com", "recruitee.com",
];
const AGENCY_HOSTS = [
  "michaelpage", "hays.", "robertwalters", "pagegroup", "roberthalf", "adecco",
  "manpower", "korn ferry", "kornferry", "heidrick", "spencerstuart", "egonzehnder",
  "linkedin.com", "bayt.com", "indeed.", "glassdoor.",
];

export type DoorClass = "agency" | "ats" | "issuer" | "unknown";

export function doorClass(routeUrl?: string | null): DoorClass {
  if (!routeUrl) return "unknown";
  let host = "";
  try { host = new URL(routeUrl).hostname.toLowerCase(); } catch { return "unknown"; }
  if (ATS_HOSTS.some((h) => host.includes(h))) return "ats";
  if (AGENCY_HOSTS.some((h) => host.includes(h))) return "agency";
  return "issuer";
}
