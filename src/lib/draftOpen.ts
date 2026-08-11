/**
 * One definition of what a `linkedin_posts` row means when it is opened as a
 * draft. Home and the ?draft= link from a lifecycle email used to disagree:
 * the email path hardcoded English and "linkedin_post", so the same Arabic
 * draft opened RTL from one door and LTR from the other.
 */
import { ARABIC } from "@/components/widgets/widgetData";

/** Columns any consumer must select for `draftFromLinkedInPost` to work. */
export const DRAFT_OPEN_COLUMNS = "id, post_text, title, content_type";

export interface OpenableDraft {
  id: string;
  body: string;
  language: "en" | "ar";
  type: "carousel" | "framework" | "linkedin_post";
  topic: string | null;
}

export function draftFromLinkedInPost(row: any): OpenableDraft {
  const body = row?.post_text ?? "";
  return {
    id: row?.id,
    body,
    language: ARABIC.test(body) ? "ar" : "en",
    type: row?.content_type === "carousel"
      ? "carousel"
      : row?.content_type === "framework"
        ? "framework"
        : "linkedin_post",
    topic: row?.title ?? null,
  };
}
