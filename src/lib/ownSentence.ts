/**
 * One real sentence, taken verbatim from the member's own LinkedIn post.
 *
 * Nothing here paraphrases and nothing here generates. If no sentence in the
 * member's own writing qualifies, the caller renders nothing at all — a
 * near-miss quote is worse than no quote.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OwnSentence {
  /** Verbatim, exactly as they wrote it. */
  text: string;
  /** "last week", "in March", "in 2024" — never a raw timestamp. */
  when: string;
}

const MIN_POST_CHARS = 200;
const MIN_SENTENCE = 80;
const MAX_SENTENCE = 180;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** A relative date a person would actually say out loud. */
export function relativeWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 0) return "";
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 35) return `${Math.round(days / 7)} weeks ago`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `in ${MONTHS[d.getMonth()]}` : `in ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Splits on sentence ends only — a line break alone is not a sentence, and a
 * fragment without terminal punctuation is never offered as one.
 */
function completeSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  const re = /[^.!?]+[.!?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) out.push(m[0].trim());
  return out;
}

const looksLikeAHashtagDump = (s: string) => (s.match(/#/g) || []).length > 1;
const startsMidThought = (s: string) => !/^["“'(\p{Lu}\p{N}]/u.test(s);

/**
 * The member's strongest post first — the sentence they are proudest of is
 * most likely to be in the post that travelled furthest.
 */
export async function loadOwnSentence(userId: string): Promise<OwnSentence | null> {
  const { data } = await supabase
    .from("linkedin_posts")
    .select("post_text, like_count, published_at")
    .eq("user_id", userId)
    .order("like_count", { ascending: false, nullsFirst: false })
    .limit(40);

  const rows = ((data as any[]) || []).filter(
    (r) => String(r.post_text || "").trim().length >= MIN_POST_CHARS,
  );

  for (const row of rows) {
    for (const s of completeSentences(String(row.post_text))) {
      if (s.length < MIN_SENTENCE || s.length > MAX_SENTENCE) continue;
      if (looksLikeAHashtagDump(s) || startsMidThought(s)) continue;
      if (/https?:\/\//i.test(s)) continue;
      return { text: s, when: relativeWhen(row.published_at) };
    }
  }
  return null;
}
