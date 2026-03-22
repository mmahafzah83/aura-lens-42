import { useEffect, useState } from "react";
import { FileStack, Loader2, ShieldCheck } from "lucide-react";
import { fetchVerifiedIntelligence, formatSignalDate, type VerifiedSignal } from "@/lib/verifiedIntelligence";

const MarketTab = () => {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<VerifiedSignal[]>([]);
  const [sectorLabel, setSectorLabel] = useState("Your active profile");
  const [practiceLabel, setPracticeLabel] = useState<string | null>(null);
  const [counts, setCounts] = useState({ captures: 0, frameworks: 0, vault: 0 });

  useEffect(() => {
    const loadWorkspace = async () => {
      setLoading(true);
      try {
        const payload = await fetchVerifiedIntelligence(8);
        setSignals(payload.signals);
        setSectorLabel(payload.sectorLabel);
        setPracticeLabel(payload.practiceLabel);
        setCounts(payload.counts);
      } catch {
        setSignals([]);
      } finally {
        setLoading(false);
      }
    };

    void loadWorkspace();
  }, []);

  return (
    <section className="space-y-6">
      <div className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Verified Intelligence Workspace</h3>
            <p className="text-sm text-muted-foreground/70 mt-2 leading-6">
              The external market feed is disabled. This workspace now surfaces only evidence already captured in your own vault, frameworks, and recent pursuits for {sectorLabel}.
            </p>
            {practiceLabel && <p className="text-xs text-muted-foreground/55 mt-2">Active practice: {practiceLabel}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">Vault items</p>
          <p className="mt-3 text-3xl font-light text-foreground tabular-nums">{counts.vault}</p>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">Captures</p>
          <p className="mt-3 text-3xl font-light text-foreground tabular-nums">{counts.captures}</p>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">Frameworks</p>
          <p className="mt-3 text-3xl font-light text-foreground tabular-nums">{counts.frameworks}</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <FileStack className="w-4.5 h-4.5 text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground tracking-widest uppercase">Reliable inputs</h4>
            <p className="text-[11px] text-muted-foreground/60 mt-1">No homepage links. No scraped headlines. Only verified internal context.</p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border/10 bg-secondary/20 px-4 py-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Loading your verified workspace…
          </div>
        ) : signals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/20 bg-secondary/20 px-4 py-8 text-center">
            <p className="text-sm text-foreground">Nothing to show yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              Add captures, links, voice notes, or frameworks and this section will immediately become your trusted intelligence view.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <article key={signal.id} className="rounded-2xl border border-border/10 bg-secondary/20 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{signal.sourceLabel}</span>
                  <span>{signal.skillLabel}</span>
                  <span>{formatSignalDate(signal.createdAt)}</span>
                </div>
                <h5 className="mt-3 text-sm sm:text-base font-semibold text-foreground">{signal.title}</h5>
                <p className="mt-2 text-sm leading-6 text-muted-foreground/75">{signal.excerpt}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default MarketTab;
