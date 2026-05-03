import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AuraButton from "@/components/ui/AuraButton";
import { SectionHeader } from "@/components/ui/SectionHeader";

const TIER_RANK: Record<string, number> = {
  Observer: 0,
  Strategist: 1,
  Authority: 2,
};

const TIER_THRESHOLD: Record<string, number> = {
  Observer: 0,
  Strategist: 40,
  Authority: 75,
};

const STORAGE_KEY = "aura_last_tier";

type Signal = { signal_title: string; confidence: number };

interface Props {
  tierName: string | null | undefined;
  score: number | null | undefined;
  sectorFocus: string;
  userId: string | null | undefined;
}

const AuthorityProgressModal = ({ tierName, score, sectorFocus, userId }: Props) => {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState(0);
  const [tier, setTier] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!tierName || !userId) return;
    let cancelled = false;
    (async () => {
      let prev: string | null = null;
      try { prev = localStorage.getItem(STORAGE_KEY); } catch {}
      const prevRank = prev != null ? TIER_RANK[prev] : undefined;
      const currRank = TIER_RANK[tierName];

      // Always store the latest known tier so future comparisons are accurate.
      try { localStorage.setItem(STORAGE_KEY, tierName); } catch {}

      // First time we see a tier — don't trigger; just remember it.
      if (prev == null || prevRank == null || currRank == null) return;
      if (currRank <= prevRank) return;

      // Tier went up: load signals and show.
      const { data } = await supabase
        .from("strategic_signals")
        .select("signal_title, confidence")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("confidence", { ascending: false });
      if (cancelled) return;
      const all = (data || []) as Signal[];
      const top = all.slice(0, 3);
      const avg = all.length
        ? Math.round((all.reduce((s, r) => s + (r.confidence || 0), 0) / all.length) * 100)
        : 0;
      setSignals(top);
      setSignalCount(all.length);
      setAvgConfidence(avg);
      setTier(tierName);
      setOpen(true);
      // Trigger enter animation
      setTimeout(() => !cancelled && setMounted(true), 10);
    })();
    return () => { cancelled = true; };
  }, [tierName, userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setMounted(false);
    setTimeout(() => setOpen(false), 200);
  };

  const share = async () => {
    const text = `I've reached ${tier} tier${sectorFocus ? ` in ${sectorFocus}` : ""} on Aura — tracking ${signalCount} strategic signal${signalCount === 1 ? "" : "s"} with ${avgConfidence}% average confidence. #StrategicIntelligence`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste into LinkedIn");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  if (!open) return null;

  const threshold = TIER_THRESHOLD[tier] ?? 0;

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        opacity: mounted ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: "var(--vellum)",
          border: "1px solid var(--brand-line)",
          borderRadius: 16,
          padding: 32,
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-body)",
          textAlign: "center",
          transform: mounted ? "scale(1)" : "scale(0.95)",
          opacity: mounted ? 1 : 0,
          transition: "all 300ms ease",
        }}
      >
        <div style={{ fontSize: 32, color: "var(--brand)", lineHeight: 1, marginBottom: 12 }} aria-hidden>★</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--brand)", marginBottom: 8, lineHeight: 1.1 }}>
          {tier}
        </div>
        <div style={{ fontSize: 16, color: "var(--ink)", marginBottom: 20 }}>
          You've reached {tier} tier{sectorFocus ? ` in ${sectorFocus}` : ""}
        </div>

        {signals.length > 0 && (
          <div style={{ textAlign: "left", marginBottom: 18 }}>
            <SectionHeader label="Your strongest signals" />
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 13, color: "var(--ink)" }}>
              {signals.map((s, i) => (
                <li key={i} style={{ padding: "4px 0", color: "var(--ink-3)" }}>
                  • <span style={{ color: "var(--ink)" }}>{s.signal_title}</span> ({Math.round((s.confidence || 0) * 100)}%)
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 20 }}>
          Score: <span style={{ color: "var(--ink)", fontWeight: 600 }}>{score ?? "—"}</span> → {threshold}+ threshold
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <AuraButton variant="primary" onClick={share}>Share on LinkedIn</AuraButton>
          <AuraButton variant="ghost" onClick={close}>Continue</AuraButton>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AuthorityProgressModal;