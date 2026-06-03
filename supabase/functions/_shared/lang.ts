// Language detector for edge functions — Arabic vs English classification

const ARABIC_START = 0x0600;
const ARABIC_END   = 0x06FF;

export function detectLang(text: string): "ar" | "en" {
  let arabicCount = 0;
  let latinCount  = 0;

  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp >= ARABIC_START && cp <= ARABIC_END) {
      arabicCount += 1;
    } else if (/[A-Za-z]/.test(char)) {
      latinCount += 1;
    }
  }

  const total = arabicCount + latinCount;
  if (total === 0) return "en";

  return arabicCount / total >= 0.30 ? "ar" : "en";
}

export function groupByLang(posts: string[]): { en: string[]; ar: string[] } {
  const result: { en: string[]; ar: string[] } = { en: [], ar: [] };

  for (const post of posts) {
    const lang = detectLang(post);
    result[lang].push(post);
  }

  return result;
}
