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
  if (row.source_type === "search_discovery") return false;
  // Aura's own drafts never train the member's voice, published or not.
  if (row.source_type === "aura_generated") return false;
  return true;
}

/** The columns every corpus query must select for `isOwnWriting` to be true. */
export const CORPUS_COLUMNS =
  "post_text, authorship, acquisition, source_type, voice_corpus_status, text_is_snippet";
