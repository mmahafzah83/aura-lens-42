/**
 * U2 — A MOVE CHIP IS AN INSTRUCTION, NOT A QUESTION.
 *
 * When the member taps `Open my library`, that tap IS the approval. The old
 * path sent the chip text back to the model, which answered with a sentence and
 * offered the same chip again — asking him to approve twice for one intent.
 *
 * This module recognises a navigation chip from its own label and returns the
 * exact destination, including the sub-tab where the surface has one, so the
 * tap moves him instead of starting a conversation about moving him.
 *
 * Nothing here is destructive: the Desk cannot publish or delete, so no chip
 * mapped in this file ever warrants a confirmation step.
 */

export interface NavTarget {
  /** Dashboard tab value (src/pages/Dashboard.tsx NAV_ITEMS). */
  tab: string;
  /** Query string applied on arrival — the sub-tab, when the surface has one. */
  params?: string;
  /** Plain name for the one short line, if any, that follows arrival. */
  en: string;
  ar: string;
}

/** Every destination a chip can resolve to, with its landed path. */
export const NAV_TARGETS: Record<string, NavTarget> = {
  library:          { tab: "library",      params: "view=sources",   en: "your library",     ar: "مكتبتك" },
  library_published:{ tab: "library",      params: "view=published", en: "your published posts", ar: "منشوراتك" },
  signals:          { tab: "intelligence", params: "sub=signals",    en: "your signals",     ar: "إشاراتك" },
  intelligence_sources: { tab: "intelligence", params: "sub=sources", en: "your sources",    ar: "مصادرك" },
  drafts:           { tab: "drafts",                                  en: "your drafts",      ar: "مسوداتك" },
  overnight:        { tab: "overnight",                               en: "the overnight",    ar: "قراءة الليل" },
  influence:        { tab: "influence",                               en: "where you stand",  ar: "موقعك" },
  identity:         { tab: "identity",                                en: "your identity",    ar: "هويتك" },
  home:             { tab: "home",                                    en: "home",             ar: "الرئيسية" },
};

const norm = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** The label the member typed or tapped, canonicalised for suppression. */
export const moveKey = (label: string) => norm(label);

/**
 * Rules, in order. First match wins. Every rule needs a NOUN — a chip that only
 * says "open" resolves to nothing and goes back to the model, as it should.
 */
const RULES: Array<[RegExp, string]> = [
  [/\bpublished\b|\bمنشورات/u, "library_published"],
  [/\blibrary\b|\bcaptures?\b|\bvault\b|\bsources? library\b|مكتبت/u, "library"],
  [/\bsignals?\b|إشارا/u, "signals"],
  [/\bdrafts?\b|مسود/u, "drafts"],
  [/\bovernight\b|\bnight read\b|قراءة الليل|الليل/u, "overnight"],
  [/\bwhere (i|you) stand\b|\binfluence\b|موقع/u, "influence"],
  [/\bidentity\b|\bmy story\b|هويت/u, "identity"],
  [/\bsources?\b|مصادر/u, "intelligence_sources"],
  [/\bhome\b|الرئيسية/u, "home"],
];

/** Verbs that make a label an instruction to move, in either language. */
const OPEN_VERB = /\b(open|go to|show|see|view|take me|jump to)\b|افتح|اذهب|أرني|اعرض|انتقل/u;

/**
 * Returns the destination when the chip is unambiguously a navigation
 * instruction, and null when it is a question for the model.
 */
export function matchNavChip(label: string): (NavTarget & { key: string }) | null {
  const t = norm(label);
  if (!t) return null;
  /* A few labels are destinations on their own, with no verb in them. */
  const BARE = /\bwhere (i|you) stand\b|^my (library|drafts|signals)$|^موقعي$/u;
  if (!OPEN_VERB.test(t) && !BARE.test(t)) return null;
  for (const [re, key] of RULES) {
    if (re.test(t)) return { key, ...NAV_TARGETS[key] };
  }
  return null;
}
