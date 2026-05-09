import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";

type TabValue = "home" | "identity" | "intelligence" | "authority" | "influence";

interface FadingSignal {
  title: string;
  confidence: number;
  velocity_status: string;
}
interface MarketMovement {
  headline: string;
  source: string;
  final_score?: number;
}
interface AlarmResponse {
  alarm: boolean;
  days_silent?: number;
  fading_signals?: FadingSignal[];
  market_movements?: MarketMovement[];
  alarm_message?: string;
}

interface Props {
  daysSinceCapture: number | null;
  onOpenCapture?: () => void;
  onSwitchTab?: (tab: TabValue) => void;
}

const SIGNAL_ORANGE = "#F97316";

const SilenceAlarm = ({ daysSinceCapture, onOpenCapture, onSwitchTab }: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AlarmResponse | null>(null);
  const [errored, setErrored] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Refresh session per project rule
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) { setErrored(true); setLoading(false); }
          return;
        }
        // Gate: "Decaying" alarm only makes sense once the user has built
        // something to decay. Suppress entirely for users with < 5 active signals.
        const { count: activeSignalCount } = await supabase
          .from("strategic_signals")
          .select("id", { count: "exact", head: true })
          .eq("status", "active");
        if ((activeSignalCount || 0) < 5) {
          if (!cancelled) { setData({ alarm: false }); setLoading(false); }
          return;
        }
        const { data: resp, error } = await supabase.functions.invoke("generate-silence-alarm", { body: {} });
        if (cancelled) return;
        if (error) {
          setErrored(true);
        } else {
          setData(resp as AlarmResponse);
        }
      } catch (e) {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loading && data?.alarm) {
      const id = window.setTimeout(() => setMounted(true), 16);
      return () => window.clearTimeout(id);
    }
  }, [loading, data]);

  // Loading skeleton
  if (loading) {
    return (
      <AuraCard hover="none">
        <div style={{ padding: 4 }}>
          <div style={{ height: 14, width: "55%", background: "var(--brand-ghost)", borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 10, width: "100%", background: "var(--brand-ghost)", borderRadius: 4, marginBottom: 6 }} />
          <div style={{ height: 10, width: "80%", background: "var(--brand-ghost)", borderRadius: 4 }} />
        </div>
      </AuraCard>
    );
  }

  // Error fallback — generic days-since nudge
  if (errored || !data) {
    if (daysSinceCapture == null || daysSinceCapture < 3) return null;
    return (
      <AuraCard hover="none">
        <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
          You haven't captured in <strong>{daysSinceCapture} days</strong>. Keep your signal base fresh.
        </p>
        <div style={{ marginTop: 10 }}>
          <AuraButton variant="primary" size="sm" onClick={() => onOpenCapture?.()} style={{ borderRadius: 4, padding: "7px 18px" }}>
            Capture now →
          </AuraButton>
        </div>
      </AuraCard>
    );
  }

  if (!data.alarm) return null;

  const fading = data.fading_signals || [];
  const movements = data.market_movements || [];

  return (
    <>
      <style>{`
        @keyframes silence-alarm-pulse {
          0% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
          40% { box-shadow: 0 0 0 4px rgba(249,115,22,0.18); }
          100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
        }
      `}</style>
      <div
        style={{
          opacity: mounted ? 1 : 0,
          transition: "opacity 400ms ease",
          animation: mounted ? "silence-alarm-pulse 1400ms ease-out 200ms 1" : undefined,
          borderRadius: 12,
        }}
      >
        <AuraCard hover="none" variant="elevated">
          <div
            style={{
              fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
              fontSize: 18,
              letterSpacing: "0.04em",
              color: "var(--brand)",
              textTransform: "uppercase",
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            While you were busy
          </div>

          <p style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)", fontSize: 14, color: "var(--ink)", lineHeight: 1.55, margin: 0 }}>
            {data.alarm_message}
          </p>

          {fading.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>
                Fading signals
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {fading.map((s, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: SIGNAL_ORANGE, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                    <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                      {Math.round((s.confidence || 0) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {movements.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>
                Market is moving
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {movements.map((m, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>
                    {m.headline}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6 }}>— {m.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <AuraButton variant="primary" size="sm" onClick={() => onOpenCapture?.()} style={{ borderRadius: 4, padding: "7px 18px" }}>
              Capture now →
            </AuraButton>
            <AuraButton variant="ghost" size="sm" onClick={() => onSwitchTab?.("intelligence")} style={{ borderRadius: 4, padding: "7px 18px" }}>
              Review fading signals →
            </AuraButton>
          </div>
        </AuraCard>
      </div>
    </>
  );
};

export default SilenceAlarm;