import { supabase } from "@/integrations/supabase/client";
import { isArabicText } from "@/lib/utils";

/**
 * STUDIO DRAFTS — the same reading the composer's drafts list performs.
 *
 * `content_items` first, then `linkedin_posts` into the same Map by id, empty
 * bodies dropped, newest first. Kept identical on purpose: both surfaces must
 * show a member the same set of waiting pieces.
 */

export type StudioDraft = {
  id: string;
  body: string;
  language: "ar" | "en";
  type: "carousel" | "framework" | "linkedin_post";
  topic: string | null;
  _source: "content_items" | "linkedin_posts";
  title: string | null;
  created_at: string;
  signalId: string | null;
};

function normaliseType(raw: any): StudioDraft["type"] {
  return raw === "carousel" ? "carousel" : raw === "framework" ? "framework" : "linkedin_post";
}

export async function loadStudioDrafts(): Promise<StudioDraft[]> {
  try {
    const [ci, lp] = await Promise.all([
      supabase
        .from("content_items")
        .select("id, type, body, language, status, generation_params, created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("linkedin_posts")
        .select(
          "id, post_text, title, hook, topic_label, format_type, tracking_status, source_type, source_metadata, source_signal_id, published_at, created_at",
        )
        .eq("tracking_status", "draft")
        .is("published_at", null)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const merged = new Map<string, StudioDraft>();

    for (const r of (ci.data as any[]) || []) {
      const params = (r.generation_params as any) || {};
      merged.set(r.id, {
        id: r.id,
        body: r.body || "",
        language: r.language === "ar" ? "ar" : "en",
        type: normaliseType(r.type),
        topic: params.topic ?? null,
        _source: "content_items",
        title: params.topic ?? null,
        created_at: r.created_at,
        signalId: params.signal_id ?? null,
      });
    }

    for (const r of (lp.data as any[]) || []) {
      const body = r.post_text || "";
      const meta = (r.source_metadata as any) || {};
      const lang = meta._language ?? meta.language ?? (isArabicText(body) ? "ar" : "en");
      merged.set(r.id, {
        id: r.id,
        body,
        language: lang === "ar" ? "ar" : "en",
        type: normaliseType(r.format_type),
        topic: meta.topic ?? null,
        _source: "linkedin_posts",
        title: r.title || r.topic_label || meta.topic || null,
        created_at: r.created_at,
        signalId: r.source_signal_id ?? (Array.isArray(meta.signal_ids) ? meta.signal_ids[0] ?? null : null),
      });
    }

    return Array.from(merged.values())
      .filter((d) => (d.body || "").trim().length > 0)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  } catch {
    return [];
  }
}

/** One draft by id, whichever table holds it. Used by the `?draft=` deep link. */
export async function loadStudioDraft(id: string): Promise<StudioDraft | null> {
  const all = await loadStudioDrafts();
  const hit = all.find((d) => d.id === id);
  if (hit) return hit;
  // A published or otherwise filtered row still opens when linked to directly.
  const { data } = await supabase
    .from("linkedin_posts")
    .select("id, post_text, title, topic_label, format_type, source_metadata, source_signal_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r: any = data;
  const meta = (r.source_metadata as any) || {};
  const body = r.post_text || "";
  const lang = meta._language ?? meta.language ?? (isArabicText(body) ? "ar" : "en");
  return {
    id: r.id,
    body,
    language: lang === "ar" ? "ar" : "en",
    type: normaliseType(r.format_type),
    topic: meta.topic ?? null,
    _source: "linkedin_posts",
    title: r.title || r.topic_label || meta.topic || null,
    created_at: r.created_at,
    signalId: r.source_signal_id ?? null,
  };
}
