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
}): boolean {
  if (row.voice_corpus_status === "excluded") return false;
  const text = String(row.post_text ?? "");
  if (text.trim().length <= MIN_POST_CHARS) return false;
  if (row.authorship === "aura_drafted") return false;
  if (row.acquisition === "discovered") return false;
  if (row.source_type === "search_discovery" || row.source_type === "aura_generated") return false;
  return true;
}