/**
 * Per-member context, read live from the database.
 *
 * Nothing about any individual member is written into this file. Every value
 * comes from that member's own rows. Missing fields degrade to "not specified".
 * Later phases score candidate signals against the structured object directly,
 * so the shape matters as much as the prompt block.
 */

const NOT_SPECIFIED = "not specified";

export interface UserContext {
  user_id: string;
  first_name: string | null;
  firm: string | null;
  level: string | null;
  core_practice: string | null;
  sector_focus: string | null;
  north_star_goal: string | null;
  years_experience: number | string | null;
  seniority_band: string | null;
  country: string | null;
  brand_pillars: string[];
  primary_strength: string | null;
  generated_skills: unknown;
  skill_ratings: Record<string, unknown> | null;
  identity_intelligence: unknown;
  content_language: string | null;
  target_register: string | null;
  active_themes: string[];
  voice: {
    tone: string | null;
    preferred_structures: unknown;
    storytelling_patterns: unknown;
    vocabulary_preferences: unknown;
    mode_key: string | null;
    language: string | null;
  } | null;
  toPromptBlock: () => string;
}

const PROFILE_COLUMNS = [
  "first_name",
  "firm",
  "level",
  "core_practice",
  "sector_focus",
  "north_star_goal",
  "years_experience",
  "seniority_band",
  "country",
  "brand_pillars",
  "primary_strength",
  "generated_skills",
  "skill_ratings",
  "identity_intelligence",
  "content_language",
  "target_register",
].join(", ");

function val(v: unknown): string {
  if (v === null || v === undefined) return NOT_SPECIFIED;
  const s = typeof v === "string" ? v.trim() : String(v);
  return s.length ? s : NOT_SPECIFIED;
}

function list(v: unknown): string {
  return Array.isArray(v) && v.length ? v.map((x) => String(x)).join(", ") : NOT_SPECIFIED;
}

export async function getUserContext(admin: any, userId: string): Promise<UserContext> {
  if (!userId) throw new Error("getUserContext: userId is required");

  const [profileRes, signalsRes, voiceRes] = await Promise.all([
    admin
      .from("diagnostic_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("strategic_signals")
      .select("theme_tags")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("priority_score", { ascending: false })
      .limit(20),
    admin
      .from("authority_voice_profiles")
      .select("tone, preferred_structures, storytelling_patterns, vocabulary_preferences, mode_key, language")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileRes?.error) console.warn("getUserContext profile:", profileRes.error.message);
  if (signalsRes?.error) console.warn("getUserContext signals:", signalsRes.error.message);
  if (voiceRes?.error) console.warn("getUserContext voice:", voiceRes.error.message);

  const p: any = profileRes?.data ?? {};
  const themeSet = new Set<string>();
  for (const row of (signalsRes?.data ?? []) as any[]) {
    for (const t of Array.isArray(row?.theme_tags) ? row.theme_tags : []) {
      if (t) themeSet.add(String(t));
    }
  }
  const v: any = voiceRes?.data ?? null;

  const ctx: UserContext = {
    user_id: userId,
    first_name: p.first_name ?? null,
    firm: p.firm ?? null,
    level: p.level ?? null,
    core_practice: p.core_practice ?? null,
    sector_focus: p.sector_focus ?? null,
    north_star_goal: p.north_star_goal ?? null,
    years_experience: p.years_experience ?? null,
    seniority_band: p.seniority_band ?? null,
    country: p.country ?? null,
    brand_pillars: Array.isArray(p.brand_pillars) ? p.brand_pillars.map((x: unknown) => String(x)) : [],
    primary_strength: p.primary_strength ?? null,
    generated_skills: p.generated_skills ?? null,
    skill_ratings: p.skill_ratings ?? null,
    identity_intelligence: p.identity_intelligence ?? null,
    content_language: p.content_language ?? null,
    target_register: p.target_register ?? null,
    active_themes: [...themeSet],
    voice: v
      ? {
        tone: v.tone ?? null,
        preferred_structures: v.preferred_structures ?? null,
        storytelling_patterns: v.storytelling_patterns ?? null,
        vocabulary_preferences: v.vocabulary_preferences ?? null,
        mode_key: v.mode_key ?? null,
        language: v.language ?? null,
      }
      : null,
    toPromptBlock: () => "",
  };

  ctx.toPromptBlock = () => {
    const ratings = ctx.skill_ratings && typeof ctx.skill_ratings === "object"
      ? Object.entries(ctx.skill_ratings)
        .filter(([, n]) => typeof n === "number")
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([k, n]) => `${k.replace(/_/g, " ")}: ${n}`)
        .join(", ")
      : "";
    return [
      "MEMBER CONTEXT (read live from this member's own records):",
      `Name: ${val(ctx.first_name)}`,
      `Organisation: ${val(ctx.firm)}`,
      `Level: ${val(ctx.level)}`,
      `Seniority band: ${val(ctx.seniority_band)}`,
      `Years of experience: ${val(ctx.years_experience)}`,
      `Country: ${val(ctx.country)}`,
      `Sector focus: ${val(ctx.sector_focus)}`,
      `Core practice: ${val(ctx.core_practice)}`,
      `North star goal: ${val(ctx.north_star_goal)}`,
      `Pillars: ${list(ctx.brand_pillars)}`,
      `Primary strength: ${val(ctx.primary_strength)}`,
      `Calibration: ${ratings.length ? ratings : NOT_SPECIFIED}`,
      `Active signal themes: ${list(ctx.active_themes)}`,
      `Writing language: ${val(ctx.content_language)}`,
      `Register: ${val(ctx.target_register)}`,
      `Voice tone: ${val(ctx.voice?.tone)}`,
      `Voice structures: ${val(
        ctx.voice?.preferred_structures ? JSON.stringify(ctx.voice.preferred_structures).slice(0, 400) : null,
      )}`,
    ].join("\n");
  };

  return ctx;
}
