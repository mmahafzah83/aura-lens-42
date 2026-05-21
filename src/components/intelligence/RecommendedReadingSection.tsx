import { useEffect, useState, useCallback } from "react";
import { ExternalLink, Loader2, RefreshCw, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import InfoTooltip from "@/components/ui/InfoTooltip";

interface Recommendation {
  title: string;
  author?: string;
  url: string | null;
  intelligence_value?: string;
  skill_gap?: string;
}

const cacheKey = () => `aura_reading_list_${new Date().toISOString().slice(0, 10)}`;

function domainFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const RecommendedReadingSection = () => {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRecs = useCallback(async (force = false) => {
    setLoading(true);
    setError(false);
    try {
      if (!force) {
        const cached = sessionStorage.getItem(cacheKey());
        if (cached) {
          setRecs(JSON.parse(cached));
          setLoading(false);
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(true); setLoading(false); return; }
      const { data, error: invokeErr } = await supabase.functions.invoke("sovereign-reading-list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeErr || !data || data.error) { setError(true); setRecs([]); return; }
      const list: Recommendation[] = data.recommendations || [];
      setRecs(list);
      try { sessionStorage.setItem(cacheKey(), JSON.stringify(list)); } catch {}
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecs(false); }, [fetchRecs]);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-7)", margin: 0 }}>
            Recommended reading
          </h3>
          <InfoTooltip content="Articles selected by Aura based on your skill gaps and sector focus" />
        </div>
        <button
          onClick={() => fetchRecs(true)}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "0.5px solid var(--surface-ink-subtle)",
            borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--ink-3)",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {loading && recs.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", marginRight: 6 }} />
          Loading recommendations…
        </div>
      ) : error || recs.length === 0 ? (
        <div style={{
          padding: 20, border: "0.5px dashed var(--surface-ink-subtle)", borderRadius: 8,
          textAlign: "center", color: "var(--ink-3)", fontSize: 12,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        }}>
          <BookOpen className="w-4 h-4" />
          Reading recommendations unavailable
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recs.map((rec, i) => {
            const domain = domainFromUrl(rec.url);
            return (
              <div key={i} style={{
                background: "var(--surface-ink-raised)",
                border: "0.5px solid var(--surface-ink-subtle)",
                borderRadius: 8, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {rec.url ? (
                      <a
                        href={rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-7)", textDecoration: "none", lineHeight: 1.4 }}
                      >
                        {rec.title}
                      </a>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-7)" }}>{rec.title}</span>
                    )}
                    {domain && (
                      <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "2px 0 0" }}>{domain}</p>
                    )}
                    {rec.intelligence_value && (
                      <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
                        {rec.intelligence_value}
                      </p>
                    )}
                  </div>
                  {rec.url && (
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--ink-3)", flexShrink: 0 }}
                      aria-label="Open article"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecommendedReadingSection;