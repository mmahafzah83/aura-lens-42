import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * "Your week, ready" — surfaces the current week's prepared drafts on Home.
 * Source: content_items where generation_params.source === "weekly_ready",
 * created this week (Mon-anchored). Review opens the exact draft in Create
 * via the shared draftPrefill channel (onOpenDraft).
 */

type DraftType = "carousel" | "framework" | "linkedin_post";

export interface WeekReadyDraft {
  id: string;
  body: string;
  language: "en" | "ar";
  type: DraftType;
  topic?: string | null;
}

interface ContentItemRow {
  id: string;
  type: string | null;
  body: string | null;
  language: string | null;
  status: string | null;
  generation_params: any;
  created_at: string;
}

interface WeekReadyCardProps {
  onOpenDraft: (draft: WeekReadyDraft) => void;
}

function startOfThisWeekIso(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun
  const offset = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset, 0, 0, 0));
  return monday.toISOString();
}

function deriveTitle(row: ContentItemRow): string {
  const fromParams = row?.generation_params?.topic;
  if (typeof fromParams === "string" && fromParams.trim()) return fromParams.trim();
  const body = (row.body || "").trim();
  if (!body) return "Untitled draft";
  const firstLine = body.split(/\r?\n/).find(l => l.trim().length > 0) || body;
  const cleaned = firstLine.replace(/^[#>*\-\s]+/, "").trim();
  return cleaned.length > 80 ? cleaned.slice(0, 78).trim() + "…" : cleaned;
}

function derivePreview(row: ContentItemRow): string {
  const body = (row.body || "").replace(/\s+/g, " ").trim();
  if (!body) return "";
  return body.length > 120 ? body.slice(0, 118).trim() + "…" : body;
}

function mapType(t: string | null | undefined): DraftType {
  if (t === "carousel") return "carousel";
  if (t === "framework") return "framework";
  return "linkedin_post";
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--brand, #B08D3A)",
  margin: 0,
};

const DIVIDER: React.CSSProperties = {
  height: 0,
  borderTop: "0.5px solid var(--brand-line, rgba(176,141,58,0.22))",
  margin: "10px 0",
};

export default function WeekReadyCard({ onOpenDraft }: WeekReadyCardProps) {
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [rows, setRows] = useState<ContentItemRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setRows([]); return; }
      const { data, error } = await supabase
        .from("content_items")
        .select("id, type, body, language, status, generation_params, created_at")
        .eq("user_id", user.id)
        .gte("created_at", startOfThisWeekIso())
        .order("created_at", { ascending: true });
      if (error) throw error;
      const filtered = ((data || []) as ContentItemRow[]).filter(
        (r) => r?.generation_params?.source === "weekly_ready",
      );
      setRows(filtered);
    } catch (e) {
      console.warn("[WeekReadyCard] load failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const prepare = useCallback(async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      // Refresh session so the JWT is fresh before invoking the edge function.
      await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("prepare-weekly-drafts");
      if (error) throw error;
      toast.success("Your week is ready.");
      await load();
    } catch (e: any) {
      console.warn("[WeekReadyCard] prepare failed", e);
      toast.error(e?.message || "Couldn't prepare your week. Please try again.");
    } finally {
      setPreparing(false);
    }
  }, [preparing, load]);

  const shippedCount = rows.filter(r => r.status === "published").length;

  return (
    <AuraCard variant="default" hover="none" className="aura-card-entry">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles aria-hidden style={{ width: 13, height: 13, color: "var(--brand, #B08D3A)" }} />
          <h3 style={LABEL_STYLE}>Your week, ready</h3>
        </div>
        {!loading && rows.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--ink-3, #6b6155)" }}>
            {shippedCount} of {rows.length} shipped this week
          </span>
        )}
      </div>

      <div style={DIVIDER} />

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--ink-3, #6b6155)", padding: "8px 0" }}>
          Loading this week's drafts…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "8px 0" }}>
          <p style={{ fontSize: 14, color: "var(--ink, #1a1612)", margin: "0 0 12px 0", lineHeight: 1.5 }}>
            Your drafts for this week aren't prepared yet.
          </p>
          <AuraButton
            variant="signal"
            size="sm"
            onClick={prepare}
            disabled={preparing}
          >
            {preparing ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Preparing your week…
              </span>
            ) : "Prepare my week"}
          </AuraButton>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}>
          {rows.map((row, idx) => {
            const lang: "en" | "ar" = row.language === "ar" ? "ar" : "en";
            const isShipped = row.status === "published";
            const title = deriveTitle(row);
            const preview = derivePreview(row);
            return (
              <li key={row.id}>
                {idx > 0 && <div style={DIVIDER} />}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "6px 0",
                    opacity: isShipped ? 0.55 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      dir="auto"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--ink, #1a1612)",
                        lineHeight: 1.35,
                        textDecoration: isShipped ? "line-through" : "none",
                      }}
                    >
                      {title}
                    </div>
                    {preview && (
                      <div
                        dir="auto"
                        style={{
                          fontSize: 12,
                          color: "var(--ink-3, #6b6155)",
                          marginTop: 3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {preview}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span
                      aria-label={lang === "ar" ? "Arabic" : "English"}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 7px",
                        borderRadius: 999,
                        border: "0.5px solid var(--brand-line, rgba(176,141,58,0.22))",
                        color: "var(--ink-3, #6b6155)",
                        background: "transparent",
                      }}
                    >
                      {lang === "ar" ? "ع" : "EN"}
                    </span>
                    {isShipped ? (
                      <span
                        aria-label="Shipped"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--brand, #B08D3A)",
                        }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Shipped
                      </span>
                    ) : (
                      <AuraButton
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onOpenDraft({
                            id: row.id,
                            body: row.body || "",
                            language: lang,
                            type: mapType(row.type),
                            topic: row?.generation_params?.topic || null,
                          })
                        }
                      >
                        Review
                      </AuraButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AuraCard>
  );
}