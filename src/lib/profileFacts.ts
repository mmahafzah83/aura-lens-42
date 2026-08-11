/**
 * PROFILE FACTS — everything Aura already read and used to throw away.
 *
 * `linkedin_profile_snapshots.raw` carries the whole profile. This reads the
 * member's own row and returns only what can be shown honestly: any figure
 * that cannot be computed is left undefined and never rendered as a zero.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RecQuote {
  /** Verbatim. Never paraphrased, never generated. */
  text: string;
  /** The writer's own title, trimmed to its first clause. */
  title: string;
}

export interface ProfileFacts {
  location?: string;
  /** Whole years since they joined LinkedIn. */
  yearsOn?: number;
  joinedYear?: number;
  role?: string;
  company?: string;
  roles?: number;
  certifications?: number;
  skills?: number;
  recommendations?: number;
  topSkills: string[];
  aboutFirstLine?: string;
  recQuote?: RecQuote;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** The first clause of a headline — "CEO and Co-Founder DUBZ | MIT Sloan" → "CEO and Co-Founder DUBZ". */
const firstClause = (s: string): string => str(s.split("|")[0]).slice(0, 90);

/** One complete sentence, long enough to mean something and short enough to read. */
const oneSentence = (text: string): string | null => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const parts = clean.match(/[^.!?]+[.!?]/g) || [];
  const good = parts.map((p) => p.trim()).find((p) => p.length >= 60 && p.length <= 240);
  return good ?? null;
};

export const pickRecQuote = (recs: any[]): RecQuote | undefined => {
  for (const r of recs) {
    const body = str(r?.description);
    const sentence = oneSentence(body);
    const title = firstClause(str(r?.givenByHeadline));
    if (sentence && title) return { text: sentence, title };
  }
  return undefined;
};

export async function loadProfileFacts(userId: string): Promise<ProfileFacts | null> {
  try {
    const { data } = await (supabase.from("linkedin_profile_snapshots" as any) as any)
      .select("raw, about, location")
      .eq("user_id", userId)
      .order("fetched_at", { ascending: false })
      .limit(1);
    const row: any = data?.[0];
    if (!row) return null;
    const raw: any = row.raw || {};

    const exp = arr(raw.experience);
    const recs = arr(raw.receivedRecommendations);
    const top = arr(raw.topSkills).map((s) => (typeof s === "string" ? s : str(s?.name))).filter(Boolean);

    const about = str(raw.about) || str(row.about);
    const aboutFirstLine = about ? (oneSentence(about) ?? about.slice(0, 180).trim()) : "";

    const registered = str(raw.registeredAt);
    const joined = registered ? new Date(registered) : null;
    const joinedYear = joined && !Number.isNaN(joined.getTime()) ? joined.getFullYear() : undefined;
    const yearsOn = joinedYear
      ? Math.max(0, Math.floor((Date.now() - (joined as Date).getTime()) / 31557600000))
      : undefined;

    const location = str(raw?.location?.linkedinText) || str(raw?.location?.parsed?.text) || str(row.location);

    const facts: ProfileFacts = {
      location: location || undefined,
      joinedYear,
      yearsOn: yearsOn && yearsOn > 0 ? yearsOn : undefined,
      role: str(exp[0]?.position) || undefined,
      company: str(exp[0]?.companyName) || undefined,
      roles: exp.length || undefined,
      certifications: arr(raw.certifications).length || undefined,
      skills: arr(raw.skills).length || undefined,
      recommendations: recs.length || undefined,
      topSkills: top.slice(0, 5),
      aboutFirstLine: aboutFirstLine || undefined,
      recQuote: pickRecQuote(recs),
    };
    return facts;
  } catch {
    return null;
  }
}
