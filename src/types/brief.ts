export interface BriefDraft {
  id: string;
  body: string;
  language: "en" | "ar";
  type: "carousel" | "framework" | "linkedin_post";
  topic?: string | null;
  _source?: "content_items" | "linkedin_posts";
}