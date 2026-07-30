import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCapturedSources } from "@/hooks/useCapturedSources";
import { Plus, Check, Loader2 } from "lucide-react";

/**
 * ReadingStrip — the compressed form of recommended reading on the Signals
 * page. Two compact rows, everything else behind "More reading". No
 * full-height cards, no amber (there is no expiry field on this page).
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };

interface Rec {
  title: string;
  url?: string | null;
  author?: string | null;
  intelligence_value?: string | null;
  skill_gap?: string | null;
}

const domainOf = (url?: string | null) => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
};

const CACHE_KEY = "aura.reading.recs.v1";

interface Props {
  onOpenCapture?: (prefillUrl?: string, prefillText?: string, sourceKey?: string) => void;
}

const ReadingStrip: React.FC<Props> = ({ onOpenCapture }) => {
  const { isCaptured } = useCapturedSources();
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) { setRecs(JSON.parse(cached)); setLoading(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setRecs([]); return; }
      const { data, error } = await supabase.functions.invoke("sovereign-reading-list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data || (data as any).error) { setRecs([]); return; }
      const list: Rec[] = (data as any).recommendations || [];
      setRecs(list);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* cache is optional */ }
    } catch { setRecs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (expanded ? recs : recs.slice(0, 2)), [recs, expanded]);

  if (loading) {
    return (
      <div style={{ ...MONO, fontSize: 11, color: "var(--text-muted)", padding: "8px 2px", display: "flex", alignItems: "center", gap: 8 }}>
        <Loader2 size={12} className="animate-spin" /> Finding what would strengthen your signals…
      </div>
    );
  }

  if (recs.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "6px 2px", fontFamily: "var(--ff-ui)" }}>
        Nothing new to recommend right now. Aura scans daily — or capture something you found yourself.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--ff-ui)" }}>
      <div style={{
        background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
        borderRadius: 12, overflow: "hidden",
      }}>
        {shown.map((rec, i) => {
          const domain = domainOf(rec.url);
          const key = (rec.url || rec.title || "").trim();
          const captured = isCaptured(key);
          const reason = (rec.intelligence_value || rec.skill_gap || "Strengthens your signals.").trim();
          return (
            <div
              key={`${key}-${i}`}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 13px",
                borderTop: i === 0 ? "0" : "1px solid var(--rule-divider)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                  {rec.url ? (
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="v23-focus"
                      style={{
                        fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", textDecoration: "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >{rec.title}</a>
                  ) : (
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rec.title}
                    </span>
                  )}
                  {domain && (
                    <span style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{domain}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 12, color: "var(--text-secondary)", marginTop: 3,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }} title={reason}>{reason}</div>
              </div>
              <button
                type="button"
                disabled={captured}
                onClick={() => onOpenCapture?.(rec.url || undefined, rec.url ? undefined : rec.title, key)}
                className="cursor-pointer v23-focus v23-tap"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                  padding: "6px 12px", borderRadius: 8, cursor: captured ? "default" : "pointer",
                  border: `1px solid ${captured ? "var(--rule-outer)" : "var(--act)"}`,
                  background: captured ? "var(--surface-subtle)" : "var(--act-tint)",
                  color: captured ? "var(--text-muted)" : "var(--act-hover)",
                  fontFamily: "var(--ff-ui)", fontSize: 12, fontWeight: 600,
                }}
              >
                {captured ? <><Check size={12} />Captured</> : <><Plus size={12} />Capture</>}
              </button>
            </div>
          );
        })}
      </div>
      {recs.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="cursor-pointer v23-focus v23-tap"
          style={{
            marginTop: 8, background: "transparent", border: 0, cursor: "pointer",
            fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600, color: "var(--act)", padding: "4px 2px",
          }}
        >{expanded ? "Less reading" : `More reading (${recs.length - 2}) →`}</button>
      )}
    </div>
  );
};

export default ReadingStrip;
