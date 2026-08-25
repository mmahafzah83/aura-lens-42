/**
 * The one definition of "a post the member actually wrote".
 *
 * Every voice measurement reads from this corpus, so a repost, a discovered
 * competitor post, or an Aura draft can never be mistaken for the member's
 * own writing.
 */
export type CorpusPost = {
  id: string;
  post_text: string;
  hook_style: string | null;
  ending_type: string | null;
};

export const MIN_POST_CHARS = 50;

/**
 * The ONLY source types that may enter a member's voice corpus.
 *
 * An allow-list, deliberately. A deny-list means every new source type
 * defaults INTO the corpus — that is how carousel drafts and search snippets
 * came within one missing stamp of teaching Aura how the member writes.
 */
export const CORPUS_SOURCE_TYPES = [
  "imported",
  "linkedin_export",
  "linkedin_own",
  // A post the member pasted by URL, or captured from their own feed with the
  // extension. Both are the member's own writing arriving by a different door.
  "manual_url",
  "browser_capture",
] as const;


/**
 * True when this row is the member's own written post.
 *
 * A member who has excluded a post on the Teach Aura review list has said
 * plainly that it is not their voice. That verdict outranks every inference
 * below it, so it is checked first.
 */
export function isOwnWriting(row: {
  post_text?: string | null;
  authorship?: string | null;
  acquisition?: string | null;
  source_type?: string | null;
  voice_corpus_status?: string | null;
  text_is_snippet?: boolean | null;
}): boolean {
  if (row.voice_corpus_status === "excluded") return false;
  const text = String(row.post_text ?? "");
  if (text.trim().length <= MIN_POST_CHARS) return false;
  // A Google/SERP description is not writing. It reads like the member because
  // it quotes them; feeding it back is how the voice engine gets poisoned.
  if (row.text_is_snippet === true) return false;
  if (row.authorship === "aura_drafted") return false;
  if (row.acquisition === "discovered") return false;
  // Allow-list: anything not named here — carousel_studio, aura_generated,
  // search_discovery, or a source type invented next month — stays out.
  if (!(CORPUS_SOURCE_TYPES as readonly string[]).includes(String(row.source_type ?? ""))) return false;
  return true;
}

/** The columns every corpus query must select for `isOwnWriting` to be true. */
export const CORPUS_COLUMNS =
  "post_text, authorship, acquisition, source_type, voice_corpus_status, text_is_snippet";

/**
 * A post's language, read off the text itself — `linkedin_posts` carries no
 * language column, and a member's own posts are the one place we cannot ask.
 */
export function corpusLang(text: string): "ar" | "en" {
  const t = String(text ?? "");
  const arabic = (t.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? "ar" : "en";
}



