import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"diagnostic_profiles">;
type Entry = Tables<"entries">;
type LearnedIntelligence = Tables<"learned_intelligence">;
type Framework = Tables<"master_frameworks">;

export type SectorKey = "water" | "finance" | "default";
export type VerifiedSource = "vault" | "capture" | "framework";

export interface VerifiedBullet {
  label: "The Shift" | "The Impact" | "The Action";
  text: string;
}

export interface VerifiedSignal {
  id: string;
  title: string;
  excerpt: string;
  createdAt: string;
  source: VerifiedSource;
  sourceLabel: string;
  skillLabel: string;
  score: number;
  bullets: VerifiedBullet[];
  prompt: string;
}

export interface VerifiedIntelligencePayload {
  counts: {
    captures: number;
    frameworks: number;
    vault: number;
  };
  practiceLabel: string | null;
  sectorKey: SectorKey;
  sectorLabel: string;
  signals: VerifiedSignal[];
}

const SECTOR_KEYWORDS: Record<SectorKey, string[]> = {
  water: ["water", "utility", "utilities", "swa", "nwc", "mewa", "swcc", "desalination", "wastewater", "digital transformation"],
  finance: ["finance", "bank", "banking", "fintech", "capital", "sama", "tadawul", "transformation"],
  default: ["transformation", "digital", "strategy", "leadership", "growth"],
};

const SOURCE_PRIORITY: Record<VerifiedSource, number> = {
  vault: 3,
  framework: 2,
  capture: 1,
};

const SOURCE_LABELS: Record<VerifiedSource, string> = {
  vault: "Verified Vault",
  capture: "Captured Evidence",
  framework: "Working Framework",
};

const cleanText = (value?: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

const previewText = (value?: string | null, limit = 180) => {
  const normalized = cleanText(value);
  if (!normalized) return "No supporting summary yet.";
  return normalized.length > limit ? `${normalized.slice(0, limit).trimEnd()}…` : normalized;
};

const splitSentences = (value: string) =>
  cleanText(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const toSectorKey = (profile?: Pick<Profile, "sector_focus"> | null): SectorKey => {
  const sector = profile?.sector_focus?.toLowerCase() ?? "";
  if (["water", "utility", "utilities", "energy"].some((keyword) => sector.includes(keyword))) return "water";
  if (["finance", "bank", "fintech", "capital"].some((keyword) => sector.includes(keyword))) return "finance";
  return "default";
};

const scoreSignal = (value: string, sectorKey: SectorKey, source: VerifiedSource) => {
  const haystack = value.toLowerCase();
  const matches = SECTOR_KEYWORDS[sectorKey].reduce((count, keyword) => count + (haystack.includes(keyword) ? 1 : 0), 0);
  return 50 + matches * 10 + SOURCE_PRIORITY[source] * 5;
};

const buildBullets = (title: string, excerpt: string, skillLabel: string): VerifiedBullet[] => {
  const sentences = splitSentences(excerpt);
  const shift = sentences[0] || title;
  const impact = sentences[1] || `${title} connects directly to your ${skillLabel.toLowerCase()} development track.`;
  const action = `Use Ask Aura to turn this verified signal into a concrete next move for your current pursuits.`;

  return [
    { label: "The Shift", text: shift },
    { label: "The Impact", text: impact },
    { label: "The Action", text: action },
  ];
};

const buildPrompt = (title: string, excerpt: string, skillLabel: string) =>
  `BLUF this verified internal signal for me and connect it to my current pursuits. Title: ${title}. Skill focus: ${skillLabel}. Context: ${excerpt}`;

const normalizeVaultItem = (item: Pick<LearnedIntelligence, "content" | "created_at" | "id" | "skill_pillars" | "title">, sectorKey: SectorKey): VerifiedSignal => {
  const excerpt = previewText(item.content);
  const skillLabel = item.skill_pillars?.[0] || "strategic growth";
  return {
    id: `vault-${item.id}`,
    title: cleanText(item.title) || "Verified vault insight",
    excerpt,
    createdAt: item.created_at,
    source: "vault",
    sourceLabel: SOURCE_LABELS.vault,
    skillLabel,
    score: scoreSignal(`${item.title} ${item.content} ${item.skill_pillars.join(" ")}`, sectorKey, "vault"),
    bullets: buildBullets(item.title, excerpt, skillLabel),
    prompt: buildPrompt(item.title, excerpt, skillLabel),
  };
};

const normalizeEntry = (item: Pick<Entry, "content" | "created_at" | "id" | "skill_pillar" | "summary" | "title" | "type">, sectorKey: SectorKey): VerifiedSignal => {
  const excerpt = previewText(item.summary || item.content);
  const skillLabel = item.skill_pillar || `${item.type} capture`;
  const title = cleanText(item.title) || `Recent ${item.type} capture`;
  return {
    id: `capture-${item.id}`,
    title,
    excerpt,
    createdAt: item.created_at,
    source: "capture",
    sourceLabel: SOURCE_LABELS.capture,
    skillLabel,
    score: scoreSignal(`${title} ${item.summary} ${item.content} ${item.skill_pillar ?? ""}`, sectorKey, "capture"),
    bullets: buildBullets(title, excerpt, skillLabel),
    prompt: buildPrompt(title, excerpt, skillLabel),
  };
};

const normalizeFramework = (item: Pick<Framework, "id" | "summary" | "tags" | "title" | "updated_at">, sectorKey: SectorKey): VerifiedSignal => {
  const excerpt = previewText(item.summary || item.tags.join(" • "));
  const skillLabel = item.tags?.[0] || "framework development";
  const title = cleanText(item.title) || "Working framework";
  return {
    id: `framework-${item.id}`,
    title,
    excerpt,
    createdAt: item.updated_at,
    source: "framework",
    sourceLabel: SOURCE_LABELS.framework,
    skillLabel,
    score: scoreSignal(`${title} ${item.summary ?? ""} ${item.tags.join(" ")}`, sectorKey, "framework"),
    bullets: buildBullets(title, excerpt, skillLabel),
    prompt: buildPrompt(title, excerpt, skillLabel),
  };
};

export const formatSignalDate = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));

export async function fetchVerifiedIntelligence(limit = 6): Promise<VerifiedIntelligencePayload> {
  const [profileResult, vaultResult, entriesResult, frameworksResult] = await Promise.all([
    supabase.from("diagnostic_profiles").select("sector_focus, core_practice").maybeSingle(),
    supabase
      .from("learned_intelligence")
      .select("id, title, content, skill_pillars, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("entries")
      .select("id, title, summary, content, skill_pillar, created_at, type")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("master_frameworks")
      .select("id, title, summary, tags, updated_at")
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (vaultResult.error) throw vaultResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (frameworksResult.error) throw frameworksResult.error;

  const sectorKey = toSectorKey(profileResult.data);
  const signals = [
    ...(vaultResult.data ?? []).map((item) => normalizeVaultItem(item, sectorKey)),
    ...(entriesResult.data ?? []).map((item) => normalizeEntry(item, sectorKey)),
    ...(frameworksResult.data ?? []).map((item) => normalizeFramework(item, sectorKey)),
  ]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, limit);

  return {
    counts: {
      captures: entriesResult.data?.length ?? 0,
      frameworks: frameworksResult.data?.length ?? 0,
      vault: vaultResult.data?.length ?? 0,
    },
    practiceLabel: profileResult.data?.core_practice ?? null,
    sectorKey,
    sectorLabel: profileResult.data?.sector_focus ?? "Your active profile",
    signals,
  };
}
