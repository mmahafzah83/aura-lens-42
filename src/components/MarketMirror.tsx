import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface MirrorRow {
  id: string;
  user_id: string;
  headhunter_text: string | null;
  client_cio_text: string | null;
  curator_text: string | null;
  gaps: { headhunter_gap?: string; client_cio_gap?: string; curator_gap?: string } | null;
  generated_at: string;
}

type TabKey = "headhunter" | "client_cio" | "curator";

const TABS: { key: TabKey; label: string }[] = [
  { key: "headhunter", label: "Headhunter" },
  { key: "client_cio", label: "Client CIO" },
  { key: "curator", label: "Conference curator" },
];

const ORANGE = "#B08D3A"; // bronze — was orange; restricted to signal/status only

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export default function MarketMirror({ userId }: { userId: string | null }) {
  const [row, setRow] = useState<MirrorRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<TabKey>("headhunter");

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("market_mirror_cache" as any)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) setRow(data as unknown as MirrorRow);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const generate = async () => {
    if (!userId) return;
    setGenerating(true);
    try {
      await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("generate-market-mirror");
      if (error) {
        const msg = (error as any)?.context?.error || error.message || "Generation failed";
        if (String(msg).includes("rate_limit") || (error as any)?.context?.status === 429) {
          toast.error("Market Mirror can be refreshed once every 7 days.");
        } else {
          toast.error("Couldn't generate Market Mirror.");
        }
        return;
      }
      if (data) setRow(data as MirrorRow);
      toast.success("Market Mirror updated");
    } catch (e: any) {
      toast.error(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const canRefresh = useMemo(() => {
    if (!row) return true;
    return Date.now() - new Date(row.generated_at).getTime() >= 7 * 24 * 60 * 60 * 1000;
  }, [row]);

  const text = row ? (row as any)[`${tab}_text`] as string | null : null;
  const gap = row?.gaps?.[`${tab}_gap` as keyof MirrorRow["gaps"]] as string | undefined;

  return (
    <div
      style={{
        background: "var(--surface-ink-raised, rgba(255,255,255,0.02))",
        border: "1px solid var(--brand-line, rgba(197,165,90,0.2))",
        borderRadius: 14,
        padding: 20,
        color: "var(--ink, #f5efe1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Eye size={16} style={{ color: "var(--brand, #C5A55A)" }} />
          <h3 style={{ fontFamily: "var(--font-display, 'Cormorant Garamond', serif)", fontSize: 20, margin: 0 }}>
            Market Mirror
          </h3>
        </div>
        {row && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--ink-muted, rgba(245,239,225,0.6))" }}>
              Last updated: {relTime(row.generated_at)}
            </span>
            <button
              onClick={generate}
              disabled={!canRefresh || generating}
              title={canRefresh ? "Refresh Market Mirror" : "Available once every 7 days"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--brand-line, rgba(197,165,90,0.3))",
                color: canRefresh ? "var(--brand, #C5A55A)" : "var(--ink-muted, rgba(245,239,225,0.4))",
                fontSize: 12, cursor: canRefresh && !generating ? "pointer" : "not-allowed",
              }}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh Mirror
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--ink-2)" }}>
          <Loader2 className="animate-spin" size={16} style={{ display: "inline-block" }} />
        </div>
      )}

      {!loading && !row && (
        <div style={{ padding: "24px 8px", textAlign: "center" }}>
          <p style={{ color: "var(--ink-2)", fontSize: 14, marginBottom: 16 }}>
            See your positioning through three market-facing perspectives — and the gaps each one would call out.
          </p>
          <button
            onClick={generate}
            disabled={generating || !userId}
            style={{
              padding: "10px 18px", borderRadius: 8,
              background: "var(--brand, #C5A55A)",
              color: "var(--ink-on-brand, #1a160f)",
              border: "none", fontWeight: 600, fontSize: 13,
              cursor: generating ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            {generating && <Loader2 size={14} className="animate-spin" />}
            Generate your Market Mirror →
          </button>
        </div>
      )}

      {row && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid var(--brand-line, rgba(197,165,90,0.18))" }}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  data-testid={
                    t.key === "headhunter" ? "story-mirror-headhunter"
                    : t.key === "client_cio" ? "story-mirror-cio"
                    : "story-mirror-curator"
                  }
                  data-active={active ? "true" : "false"}
                  style={{
                    padding: "8px 12px",
                    background: "transparent",
                    border: "none",
                    borderBottom: active ? "2px solid var(--brand, #C5A55A)" : "2px solid transparent",
                    color: active ? "var(--brand, #C5A55A)" : "var(--ink-muted, rgba(245,239,225,0.6))",
                    fontSize: 13, fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink, #f5efe1)", whiteSpace: "pre-wrap", margin: "0 0 14px" }}>
            {text || "No perspective generated."}
          </p>

          {gap && (
            <div
              style={{
                marginTop: 8, padding: "10px 12px",
                background: `${ORANGE}14`,
                borderLeft: `3px solid ${ORANGE}`,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: ORANGE, fontWeight: 600, marginBottom: 4 }}>
                Authority gap
              </div>
              <div style={{ fontSize: 13, color: "var(--ink, #f5efe1)", lineHeight: 1.5 }}>{gap}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}