/**
 * oe-seed-ref — fills the member-facing reference lists ONCE.
 *
 * Country names and their Arabic names are read from the runtime's own ICU
 * data, not typed out here. Region membership is the only judgement, and it
 * lives in this seeder — never in a gate. Run it again and it upserts.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SKIP = new Set(["AC", "TA", "EU", "EZ", "UN", "QO", "XA", "XB", "DG", "IC", "EA", "CP", "CQ"]);
const GCC = ["SA", "AE", "QA", "KW", "BH", "OM"];
const MENA = [...GCC, "JO", "EG", "LB", "IQ", "SY", "YE", "PS", "DZ", "MA", "TN", "LY", "SD", "MR", "SO", "DJ", "KM", "IR", "TR", "IL"];
const EUR = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "NO", "CH", "IS", "UA", "RS", "AL", "BA", "MK", "ME", "MD", "BY", "RU", "LI", "MC", "AD", "SM", "VA", "XK", "GI", "FO", "GG", "JE", "IM", "AX", "SJ"];
const NA = ["US", "CA", "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "HT", "JM", "TT", "BS", "BB", "AG", "DM", "GD", "KN", "LC", "VC", "PR", "BM", "GL", "AW", "CW", "SX", "TC", "VG", "VI", "KY", "MS", "AI", "BQ", "BL", "MF", "GP", "MQ", "PM"];
const LATAM = ["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE", "FK", "GF"];
const APAC = ["CN", "JP", "KR", "KP", "MN", "TW", "HK", "MO", "IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF", "TH", "VN", "KH", "LA", "MM", "MY", "SG", "ID", "PH", "BN", "TL", "AU", "NZ", "PG", "FJ", "SB", "VU", "NC", "PF", "WS", "TO", "KI", "TV", "NR", "FM", "MH", "PW", "CK", "NU", "TK", "AS", "GU", "MP", "WF", "NF", "CX", "CC", "HM", "PN", "TF", "IO", "KZ", "UZ", "TM", "KG", "TJ", "AZ", "AM", "GE", "RU"];
const AFRICA = ["DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CD", "CG", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW", "YT", "RE", "SH", "EH"];

const REGIONS = [
  { code: "GCC", name_en: "Gulf", name_ar: "الخليج", sort: 1 },
  { code: "MENA", name_en: "Middle East and North Africa", name_ar: "الشرق الأوسط وشمال أفريقيا", sort: 2 },
  { code: "EU", name_en: "Europe", name_ar: "أوروبا", sort: 3 },
  { code: "NA", name_en: "North America", name_ar: "أمريكا الشمالية", sort: 4 },
  { code: "APAC", name_en: "Asia-Pacific", name_ar: "آسيا والمحيط الهادئ", sort: 5 },
  { code: "AFRICA", name_en: "Africa", name_ar: "أفريقيا", sort: 6 },
  { code: "LATAM", name_en: "Latin America", name_ar: "أمريكا اللاتينية", sort: 7 },
  { code: "WORLD", name_en: "Worldwide", name_ar: "العالم", sort: 8 },
];

const SECTORS: Array<[string, string, string]> = [
  ["government", "Government", "الحكومة"],
  ["utilities_water", "Utilities and water", "المرافق والمياه"],
  ["energy", "Energy", "الطاقة"],
  ["health", "Health", "الصحة"],
  ["education", "Education", "التعليم"],
  ["finance_banking", "Finance and banking", "التمويل والمصارف"],
  ["insurance", "Insurance", "التأمين"],
  ["technology", "Technology", "التقنية"],
  ["telecom", "Telecommunications", "الاتصالات"],
  ["real_estate_construction", "Real estate and construction", "العقار والإنشاء"],
  ["logistics_transport", "Logistics and transport", "اللوجستيات والنقل"],
  ["manufacturing_industrial", "Manufacturing and industry", "الصناعة والتصنيع"],
  ["retail_consumer", "Retail and consumer", "التجزئة والمستهلك"],
  ["tourism_entertainment", "Tourism and entertainment", "السياحة والترفيه"],
  ["media", "Media", "الإعلام"],
  ["consulting_professional", "Consulting and professional services", "الاستشارات والخدمات المهنية"],
  ["nonprofit_international", "Non-profit and international bodies", "غير الربحي والمنظمات الدولية"],
  ["defence_security", "Defence and security", "الدفاع والأمن"],
  ["agriculture_food", "Agriculture and food", "الزراعة والغذاء"],
  ["mining_materials", "Mining and materials", "التعدين والمواد"],
];

const LEVELS: Array<[string, number, string, string]> = [
  ["board_csuite", 5, "Board and chief executive", "مجلس الإدارة والرئاسة التنفيذية"],
  ["executive", 4, "Executive — vice president, director, general manager", "تنفيذي — نائب رئيس أو مدير عام"],
  ["senior_manager", 3, "Senior manager", "مدير أول"],
  ["manager", 2, "Manager", "مدير"],
  ["specialist", 1, "Specialist", "أخصائي"],
];

const ENGAGEMENTS: Array<[string, string, string]> = [
  ["full_time", "Full time", "دوام كامل"],
  ["fractional", "Fractional", "دوام جزئي"],
  ["advisory", "Advisory", "استشاري"],
  ["project", "Project", "مشروع"],
];

const ORG_TYPES: Array<[string, string, string]> = [
  ["government", "Government", "جهة حكومية"],
  ["listed", "Listed company", "شركة مدرجة"],
  ["private", "Private company", "شركة خاصة"],
  ["multinational", "Multinational", "شركة متعددة الجنسيات"],
  ["consulting", "Consulting firm", "شركة استشارية"],
  ["startup", "Start-up", "شركة ناشئة"],
  ["nonprofit", "Non-profit", "جهة غير ربحية"],
  ["international_org", "International organisation", "منظمة دولية"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = req.headers.get("apikey") ?? req.headers.get("authorization") ?? "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cron = Deno.env.get("CRON_SECRET") ?? "";
  if (!key.includes(secret) && req.headers.get("x-cron-secret") !== cron) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secret);

  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const ar = new Intl.DisplayNames(["ar"], { type: "region" });
  const countries: Array<{ iso2: string; name_en: string; name_ar: string; region_codes: string[] }> = [];
  for (let i = 65; i < 91; i++) {
    for (let j = 65; j < 91; j++) {
      const c = String.fromCharCode(i) + String.fromCharCode(j);
      if (SKIP.has(c)) continue;
      let nameEn: string;
      try { nameEn = en.of(c) ?? c; } catch { continue; }
      if (!nameEn || nameEn === c) continue;
      const regions = ["WORLD"];
      if (GCC.includes(c)) regions.push("GCC");
      if (MENA.includes(c)) regions.push("MENA");
      if (EUR.includes(c)) regions.push("EU");
      if (NA.includes(c)) regions.push("NA");
      if (APAC.includes(c)) regions.push("APAC");
      if (AFRICA.includes(c)) regions.push("AFRICA");
      if (LATAM.includes(c)) regions.push("LATAM");
      countries.push({ iso2: c, name_en: nameEn, name_ar: (ar.of(c) ?? nameEn), region_codes: regions });
    }
  }

  const errors: string[] = [];
  const up = async (table: string, rows: unknown[], onConflict: string) => {
    const { error } = await admin.from(table).upsert(rows as never, { onConflict });
    if (error) errors.push(`${table}: ${error.message}`);
  };
  await up("oe_ref_regions", REGIONS, "code");
  await up("oe_ref_countries", countries, "iso2");
  await up("oe_ref_sectors", SECTORS.map(([code, name_en, name_ar], i) => ({ code, name_en, name_ar, sort: i + 1 })), "code");
  await up("oe_ref_levels", LEVELS.map(([code, rank, name_en, name_ar]) => ({ code, rank, name_en, name_ar })), "code");
  await up("oe_ref_engagements", ENGAGEMENTS.map(([code, name_en, name_ar], i) => ({ code, name_en, name_ar, sort: i + 1 })), "code");
  await up("oe_ref_org_types", ORG_TYPES.map(([code, name_en, name_ar], i) => ({ code, name_en, name_ar, sort: i + 1 })), "code");

  return new Response(JSON.stringify({ ok: errors.length === 0, countries: countries.length, errors }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
