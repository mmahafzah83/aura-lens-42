// Shared hashtag helpers. Extracted from CarouselStudio so all Studio-family
// pages (Carousel, Edition, one-pagers) apply the same dedupe rules.

export function isArabicTag(tag: string): boolean {
  return /[\u0600-\u06FF]/.test(tag);
}

export function normalizeTag(tag: string): string {
  return tag.startsWith("#") ? tag : "#" + tag;
}

export function dedupeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tags || []) {
    const nt = normalizeTag(t);
    const key = isArabicTag(nt) ? nt : nt.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(nt);
    }
  }
  return result;
}

export function stripDuplicateHashtags(caption: string, tags: string[]): string {
  const deduped = dedupeHashtags(tags);
  const tagSet = new Set(deduped.map(t => isArabicTag(t) ? t : t.toLowerCase()));
  let result = caption.replace(/#[^\s#]+/g, match => {
    const key = isArabicTag(match) ? match : match.toLowerCase();
    return tagSet.has(key) ? "" : match;
  });
  result = result.replace(/[ \t]{2,}/g, " ");
  result = result
    .split("\n")
    .map(l => l.trimEnd())
    .filter(l => l.length > 0)
    .join("\n");
  return result;
}