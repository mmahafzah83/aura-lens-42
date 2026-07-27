import { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle, TrendingUp, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TIER_BANDS, bandFromScore } from "@/hooks/useTierFromImprint";

/**
 * InsightCards — the V23 insight row on Home.
 *
 * Every card is computed from data that already exists. A card whose
 * denominator is zero (or whose source is empty) is not rendered at all —
 * no placeholders, no invented metrics. Colour law: amber only where a real
 * clock ran out, blue for "your turn", cyan for machine observation.
 */

type Tone = "clock" | "act" | "machine";

interface Insight {
  key: string;
  tone: Tone;
  label: string;
  statement: string;
  denominator: string;
  cta: string;
  onGo: () => void;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
};

const TONE = {
  clock:   { wash: "var(--v23-wash-clock)",   ink: "var(--deadline-text)", Icon: AlertTriangle },
  act:     { wash: "var(--v23-wash-act)",     ink: "var(--act)",           Icon: TrendingUp },
  machine: { wash: "var(--v23-wash-machine)", ink: "var(--machine-text)",  Icon: Languages },
} as const;

function isArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s || "");
}

interface Props {
  userId: string | null;
  onSwitchTab: (tab: string) => void;
}

export default function InsightCards({ userId, onSwitchTab }: Props) {
  const [items, setItems] = useState<Insight[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const next: Insight[] = [];

      const [sigRes, impRes, postRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select("id, status, velocity_status, updated_at")
          .eq("user_id", userId).gte("updated_at", since).limit(500),
        supabase.from("imprint_snapshots").select("imprint")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
        (supabase.from("linkedin_posts" as any) as any)
          .select("id, post_text, source_signal_id, published_at")
          .eq("user_id", userId).not("published_at", "is", null)
          .gte("published_at", since).limit(500),
      ]);

      const posts = ((postRes?.data as any[]) || []);
      const publishedSignalIds = new Set(
        posts.map((p) => p.source_signal_id).filter(Boolean) as string[],
      );

      // 1 · COSTING YOU POINTS — real expiry only.
      const faded = ((sigRes?.data as any[]) || []).filter((s) => {
        const v = (s.velocity_status || "").toLowerCase();
        const st = (s.status || "").toLowerCase();
        return v.includes("fad") || v.includes("dorman") || st === "expired" || st === "archived" || st === "dormant";
      });
      const unused = faded.filter((s) => !publishedSignalIds.has(s.id));
      if (unused.length > 0) {
        next.push({
          key: "expired",
          tone: "clock",
          label: "Costing you points",
          statement: `${unused.length} ${unused.length === 1 ? "signal" : "signals"} faded without a post.`,
          denominator: `of ${faded.length} that faded in the last 90 days`,
          cta: "See what expired",
          onGo: () => onSwitchTab("intelligence"),
        });
      }

      // 2 · ALMOST THERE — distance to the next scoring band.
      const imprint = ((impRes.data as any[]) || [])[0]?.imprint;
      if (typeof imprint === "number") {
        const score = Math.round(imprint);
        const band = bandFromScore(score);
        const idx = band ? TIER_BANDS.findIndex((b) => b.key === band.key) : -1;
        const nextBand = idx >= 0 ? TIER_BANDS[idx + 1] : undefined;
        if (nextBand) {
          const gap = nextBand.min - score;
          next.push({
            key: "tier",
            tone: "act",
            label: "Almost there",
            statement: `${gap} ${gap === 1 ? "point" : "points"} to ${nextBand.name}.`,
            denominator: `imprint ${score} of 100 · ${band!.name} band`,
            cta: "See what moves it",
            onGo: () => onSwitchTab("influence"),
          });
        }
      }

      // 3 · LANGUAGE MIX — ratio only. Per-post reach is not claimed.
      if (posts.length > 0) {
        const ar = posts.filter((p) => isArabic(p.post_text || "")).length;
        const en = posts.length - ar;
        const arPct = Math.round((ar / posts.length) * 100);
        next.push({
          key: "language",
          tone: "machine",
          label: "Language mix",
          statement: `${arPct}% Arabic, ${100 - arPct}% English.`,
          denominator: `${ar} Arabic and ${en} English posts published in the last 90 days`,
          cta: "Draft the next one in Arabic",
          onGo: () => onSwitchTab("authority"),
        });
      }

      if (!cancelled) setItems(next);
    })().catch((e) => console.warn("[InsightCards] load failed", e));

    return () => { cancelled = true; };
  }, [userId, onSwitchTab]);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="home-insight-cards"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}
    >
      {items.map((it) => {
        const t = TONE[it.tone];
        return (
          <div
            key={it.key}
            style={{
              position: "relative", overflow: "hidden",
              background: "var(--surface-card)",
              border: "1px solid var(--rule-outer)",
              borderRadius: 16, padding: 16,
              boxShadow: "var(--v23-card-rest)",
              fontFamily: "var(--ff-ui)",
            }}
          >
            <span aria-hidden style={{
              position: "absolute", inset: 0, background: t.wash, pointerEvents: "none",
            }} />
            <div style={{ position: "relative" }}>
              <div style={{
                ...MONO, display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase",
                color: t.ink,
              }}>
                <t.Icon size={12} />{it.label}
              </div>
              <p style={{
                margin: "9px 0 3px", fontSize: 15, lineHeight: 1.4,
                fontWeight: 600, color: "var(--text-primary)",
              }}>{it.statement}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-muted)" }}>{it.denominator}</p>
              <button
                type="button"
                className="cursor-pointer"
                onClick={it.onGo}
                style={{
                  marginTop: 11, background: "transparent", border: 0, padding: 0,
                  cursor: "pointer", color: "var(--act)", fontSize: 13, fontWeight: 600,
                  fontFamily: "var(--ff-ui)", display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >{it.cta}<ArrowRight size={13} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
