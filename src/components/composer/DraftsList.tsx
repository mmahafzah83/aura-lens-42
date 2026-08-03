import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import { isArabicText } from "@/lib/utils";

/**
 * DRAFTS LIST — the waiting drafts a member can open.
 *
 * Reads content_items (status=draft) and linkedin_posts (tracking_status=draft),
 * merges them, and hands one back on click in exactly the shape CreateTab's
 * draftPrefill effect already consumes. Renders nothing when there is nothing.
 */

export type DraftRow = {
  id: string;
  body: string;
  language: "ar" | "en";
  type: "carousel" | "framework" | "linkedin_post";
  topic: string | null;
  _source: "content_items" | "linkedin_posts";
  title: string | null;
  created_at: string;
};

function normaliseType(raw: any): DraftRow["type"] {
  return raw === "carousel" ? "carousel" : raw === "framework" ? "framework" : "linkedin_post";
}

function firstLine(text: string): string {
  const line = (text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  return line.length > 120 ? line.slice(0, 120).trimEnd() + "…" : line;
}

export default function DraftsList({ onOpenDraft }: { onOpenDraft?: (d: any) => void }) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
              "id, post_text, title, hook, topic_label, format_type, tracking_status, source_type, source_metadata, published_at, created_at"
            )
            .eq("tracking_status", "draft")
            .is("published_at", null)
            .order("created_at", { ascending: false })
            .limit(200),
        ]);

        const merged = new Map<string, DraftRow>();

        for (const r of (ci.data as any[]) || []) {
          const body = r.body || "";
          merged.set(r.id, {
            id: r.id,
            body,
            language: r.language === "ar" ? "ar" : "en",
            type: normaliseType(r.type),
            topic: (r.generation_params as any)?.topic ?? null,
            _source: "content_items",
            title: (r.generation_params as any)?.topic ?? null,
            created_at: r.created_at,
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
          });
        }

        const list = Array.from(merged.values())
          .filter((d) => (d.body || "").trim().length > 0)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

        if (!cancelled) setRows(list);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              height: 58,
              borderRadius: 12,
              background: "var(--surface-subtle)",
              border: "1px solid var(--border-default)",
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section aria-label="Your drafts" style={{ marginBottom: 34 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--ff-ui)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
          }}
        >
          Your drafts
        </span>
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12, color: "var(--text-secondary)" }}>
          Posts Aura has already written for you. Tap one to open it.
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((d) => (
          <button
            key={d.id}
            type="button"
            className="text-left w-full"
            onClick={() =>
              onOpenDraft?.({
                id: d.id,
                body: d.body,
                language: d.language,
                type: d.type,
                topic: d.topic,
                _source: d._source,
              })
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--act)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: 14,
              borderRadius: 12,
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              boxShadow: "var(--shadow-card)",
              cursor: "pointer",
              transition: "border-color 150ms ease",
              minWidth: 0,
            }}
          >
            <span
              dir="auto"
              style={{
                fontFamily: "var(--ff-ui)",
                fontSize: 14.5,
                fontWeight: 600,
                lineHeight: 1.4,
                color: "var(--text-primary)",
                overflowWrap: "anywhere",
              }}
            >
              {d.title || firstLine(d.body) || "Untitled draft"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "var(--ff-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: ".04em",
                }}
              >
                saved {formatSmartDate(d.created_at)}
              </span>
              <span
                style={{
                  fontFamily: "var(--ff-ui)",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  background: "var(--surface-subtle)",
                  borderRadius: 6,
                  padding: "2px 7px",
                }}
              >
                {d.language === "ar" ? "العربية" : "English"}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}