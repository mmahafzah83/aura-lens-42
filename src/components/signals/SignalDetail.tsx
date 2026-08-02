import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ButtonGhost } from "@/components/systemb";
import { SignalHero, type Signal } from "@/components/tabs/IntelligenceTab";
import { trackSignalOpen } from "@/lib/trackSignalOpen";

/**
 * SignalDetail — the EXISTING signal detail experience (SignalHero and its
 * own evidence loading), lifted out of Observatory so the Signals board can
 * be the whole page. No detail logic is rebuilt here: this file only loads
 * the one signal row and hands it to SignalHero exactly as Observatory did.
 */

interface Props {
  signalId: string;
  onBack: () => void;
  onOpenChat?: (msg?: string) => void;
  onDraftToStudio?: (prefill: {
    topic: string; context: string; signalId?: string; signalTitle?: string; source?: string;
  }) => void;
}

const SignalDetail: React.FC<Props> = ({ signalId, onBack, onOpenChat, onDraftToStudio }) => {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("strategic_signals")
        .select("*, signal_velocity, velocity_status, commercial_validation_score")
        .eq("id", signalId)
        .maybeSingle();
      if (cancelled) return;
      setSignal((data as unknown as Signal) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [signalId]);

  // Same handoff Observatory used: nudge priority, then hand to the studio.
  const draftFromSignal = useCallback(async (s: Signal) => {
    await supabase.from("strategic_signals")
      .update({ priority_score: (s.priority_score || 0) + 0.05 }).eq("id", s.id);
    try { trackSignalOpen(s.id, "signal_detail_draft_handoff"); } catch { /* never blocks */ }
    onDraftToStudio?.({
      topic: s.signal_title,
      context: [s.explanation, s.strategic_implications, s.what_it_means_for_you].filter(Boolean).join("\n\n"),
      signalId: s.id, signalTitle: s.signal_title, source: "signals_board",
    });
  }, [onDraftToStudio]);

  return (
    <section data-testid="signal-detail" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      <ButtonGhost onClick={onBack} data-testid="signal-detail-back" style={{ marginBottom: 14 }}>
        <ArrowLeft size={13} />All signals
      </ButtonGhost>
      {loading ? (
        <div style={{ fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--text-muted)", padding: 20 }}>
          Loading signal…
        </div>
      ) : !signal ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 20 }}>
          That signal is no longer available.
        </div>
      ) : (
        <>
          <SignalHero signal={signal} onDraft={draftFromSignal} onOpenChat={onOpenChat} />
          <div style={{ marginTop: 12 }}>
            <ButtonGhost
              data-testid="signal-make-carousel"
              onClick={() => { window.location.href = `/carousel-studio?signal=${signal.id}`; }}
            >
              <LayoutGrid size={13} />Make a carousel
            </ButtonGhost>
          </div>
        </>
      )}
    </section>
  );
};

export default SignalDetail;
