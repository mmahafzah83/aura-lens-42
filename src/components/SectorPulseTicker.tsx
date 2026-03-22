import { useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchVerifiedIntelligence, formatSignalDate, type VerifiedSignal } from "@/lib/verifiedIntelligence";

interface SectorPulseTickerProps {
  onOpenChat?: (msg?: string) => void;
}

const SectorPulseTicker = ({ onOpenChat }: SectorPulseTickerProps) => {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<VerifiedSignal[]>([]);
  const [sectorLabel, setSectorLabel] = useState("Your active profile");
  const [selectedSignal, setSelectedSignal] = useState<VerifiedSignal | null>(null);

  useEffect(() => {
    const loadSignals = async () => {
      setLoading(true);
      try {
        const payload = await fetchVerifiedIntelligence(6);
        setSignals(payload.signals);
        setSectorLabel(payload.sectorLabel);
      } catch {
        setSignals([]);
      } finally {
        setLoading(false);
      }
    };

    void loadSignals();
  }, []);

  return (
    <>
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Verified Intelligence</h3>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Internal-only signals for {sectorLabel}. External live links are hidden during Data Quality phase.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-border/20 bg-secondary/40 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border/10 bg-secondary/20 px-4 py-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Building a verified signal board…
          </div>
        ) : signals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/20 bg-secondary/20 px-4 py-8 text-center">
            <p className="text-sm text-foreground">External market links are currently suppressed.</p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              Once you add more captures or vault intelligence, this area will show verified internal signals only.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <button
                key={signal.id}
                type="button"
                onClick={() => setSelectedSignal(signal)}
                className="w-full rounded-2xl border border-border/10 bg-secondary/20 p-4 text-left transition-colors hover:bg-secondary/35"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{signal.sourceLabel}</span>
                  <span>{signal.skillLabel}</span>
                  <span>{formatSignalDate(signal.createdAt)}</span>
                </div>
                <h4 className="mt-3 text-sm sm:text-base font-semibold text-foreground">{signal.title}</h4>
                <p className="mt-2 text-sm leading-6 text-muted-foreground/75">{signal.excerpt}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <Sheet open={!!selectedSignal} onOpenChange={(open) => !open && setSelectedSignal(null)}>
        <SheetContent side="bottom" className="rounded-t-[28px] border-border/15 bg-background/98 px-0">
          {selectedSignal && (
            <div className="px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
              <SheetHeader className="px-0 text-left">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{selectedSignal.sourceLabel}</span>
                  <span>{selectedSignal.skillLabel}</span>
                  <span>{formatSignalDate(selectedSignal.createdAt)}</span>
                </div>
                <SheetTitle className="text-xl text-foreground leading-tight">{selectedSignal.title}</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-3">
                {selectedSignal.bullets.map((bullet) => (
                  <div key={bullet.label} className="rounded-2xl border border-border/10 bg-secondary/20 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">{bullet.label}</p>
                    <p className="mt-2 text-sm leading-6 text-foreground/85">{bullet.text}</p>
                  </div>
                ))}
              </div>

              {onOpenChat && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenChat(selectedSignal.prompt);
                    setSelectedSignal(null);
                  }}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="w-4 h-4" />
                  Deep Dive with Aura
                </button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SectorPulseTicker;
