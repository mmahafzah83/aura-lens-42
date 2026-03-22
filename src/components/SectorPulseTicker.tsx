import { useState, useEffect, useCallback } from "react";
import { Zap, ExternalLink, TrendingUp, Loader2, MessageCircle, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ── Sovereign Source Matrix ────────────────────────── */
const SOURCE_MATRIX = {
  saudi_official: [
    "SDAIA", "DGA", "MCIT", "SWA", "Ministry of Energy",
    "Ministry of Finance", "MISA", "SAMA",
  ],
  pif: ["Public Investment Fund"],
  saudi_press: [
    "Arab News", "Saudi Gazette", "Argaam",
    "Asharq Al-Awsat", "Al-Eqtisadiah",
  ],
  competitors: ["Deloitte", "PwC", "McKinsey", "BCG", "Bain"],
  ey: ["EY Global", "EY MENA"],
};

/* ── Profile-Linked Sector Keywords ─────────────────── */
const SECTOR_KEYWORDS: Record<string, string[]> = {
  water: ["water", "utilities", "desalination", "NWC", "MEWA", "NEOM Water", "wastewater", "smart metering", "recycled water"],
  finance: ["banking", "fintech", "SAMA", "capital markets", "IPO", "insurance", "PIF investments", "sovereign wealth"],
  energy: ["energy", "renewables", "green hydrogen", "oil & gas", "ACWA Power", "solar", "grid"],
  tech: ["AI", "cloud", "cybersecurity", "digital transformation", "5G", "smart city"],
  default: ["Vision 2030", "Saudi Arabia", "GCC", "mega-projects", "privatization"],
};

/* ── Hardcoded 2026 signals per sector ──────────────── */
const SEED_SIGNALS: Record<string, TickerItem[]> = {
  water: [
    { headline: "NEOM Water Expansion 2026: SAR 3.2B desalination mega-plant breaks ground — capacity +45% by 2028", source: "Arab News", sourceType: "saudi_press", url: "https://www.arabnews.com", sector: "water", skillTarget: "Sector Foresight", bluf: "NEOM's mega-plant represents the largest single desalination investment in 2026|Regional water security shifts from scarcity-management to capacity-surplus, redefining utility ROI models|Position your client advisory around 'surplus-economy' frameworks — this is your next PoV anchor" },
    { headline: "MEWA 2026 Strategy: AI-driven smart metering mandate for all urban networks — 20% efficiency target", source: "MEWA", sourceType: "saudi_official", url: null, sector: "water", skillTarget: "Digital Synthesis", bluf: "Mandatory AI metering across urban networks signals a regulatory technology push|Utilities must now budget for IoT/AI integration — non-compliance risks license revocation|Lead a 'Digital Readiness Assessment' for NWC/SWCC to capture first-mover advisory revenue" },
    { headline: "NWC privatization Phase III accelerates — new PPP model for 5 regional utilities announced Q1 2026", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://www.saudigazette.com.sa", sector: "water", skillTarget: "Commercial Velocity", bluf: "Phase III PPP signals SAR 8B+ in advisory opportunities across 5 regional clusters|EY's transaction advisory must compete with Deloitte's existing NWC engagement|Prepare a 'Value-Based PPP Framework' pitch deck for Q2 to pre-empt competitor lock-in" },
    { headline: "Vision 2030 recycled water target raised to 85% — industrial reuse regulation imminent", source: "Ministry of Energy", sourceType: "saudi_official", url: null, sector: "water", skillTarget: "Geopolitical Fluency", bluf: "85% recycled target exceeds EU benchmarks — Saudi Arabia becomes a global water-reuse leader|Industrial clients face mandatory reuse compliance within 18 months|Draft a 'Compliance Roadmap' service offering targeting petrochemical and manufacturing sectors" },
    { headline: "McKinsey publishes 'Future of Saudi Water 2035' — positions desalination-AI convergence as $12B opportunity", source: "McKinsey", sourceType: "competitors", url: "https://www.mckinsey.com", sector: "water", skillTarget: "Strategic Architecture", bluf: "McKinsey is framing the narrative — their thought leadership will influence MEWA's next 5-year plan|If EY doesn't publish a counter-PoV within 90 days, McKinsey owns the intellectual territory|Commission a rapid-response whitepaper: 'Beyond Desalination — The Circular Water Economy'" },
    { headline: "EY MENA launches Sustainability & Water Practice — 15 new hires planned for Riyadh", source: "EY MENA", sourceType: "ey", url: null, sector: "water", skillTarget: "Human-Centric Leadership", bluf: "Internal expansion signals leadership commitment to water advisory as a growth vertical|New hires need onboarding frameworks and mentorship — a Director-level opportunity|Volunteer to lead the practice's 'Knowledge Architecture' initiative to increase internal visibility" },
  ],
  finance: [
    { headline: "SAMA issues new Open Banking framework — fintech API standards mandated by Q3 2026", source: "SAMA", sourceType: "saudi_official", url: null, sector: "finance", skillTarget: "Digital Synthesis", bluf: "Open Banking mandate disrupts traditional bank revenue models — API-first becomes non-negotiable|Banks must invest SAR 500M+ in technology upgrades within 18 months|Position EY as the integration partner for Tier 1 banks — lead with a 'Digital Readiness' assessment" },
    { headline: "PIF announces SAR 40B allocation for financial services sector growth in 2026-2028", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa", sector: "finance", skillTarget: "Commercial Velocity", bluf: "SAR 40B allocation creates unprecedented advisory demand across M&A, valuation, and regulatory|EY's Transaction Advisory must scale to capture at least 15% of the addressable market|Build relationships with PIF portfolio companies now — the RFP cycle begins in Q2" },
    { headline: "Argaam reports record IPO pipeline — 12 companies seeking Tadawul listing in H1 2026", source: "Argaam", sourceType: "saudi_press", url: "https://www.argaam.com", sector: "finance", skillTarget: "Strategic Architecture", bluf: "12 IPO mandates represent SAR 2B+ in advisory fees across audit, tax, and consulting|Deloitte currently leads with 4 mandates — EY must accelerate pipeline conversion|Prioritize 3 high-value targets and deploy dedicated pursuit teams this quarter" },
    { headline: "BCG publishes 'Saudi Banking 2030' report — predicts 40% digital-only customer base", source: "BCG", sourceType: "competitors", url: "https://www.bcg.com", sector: "finance", skillTarget: "Sector Foresight", bluf: "BCG's narrative will shape SAMA's digital banking strategy for the next 3 years|If EY doesn't counter with proprietary research, BCG owns the intellectual high ground|Commission a rapid-response PoV: 'Beyond Digital — The Cognitive Bank'" },
  ],
  default: [
    { headline: "Vision 2030 mid-cycle review signals acceleration of privatization across 8 sectors", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://www.saudigazette.com.sa", sector: "default", skillTarget: "Strategic Architecture", bluf: "Privatization acceleration creates SAR 50B+ in total advisory opportunities across sectors|EY must position early in Transportation, Health, and Education verticals|Develop a cross-sector 'Privatization Readiness Index' as a proprietary diagnostic tool" },
    { headline: "SDAIA mandates AI governance framework for all government entities by 2027", source: "SDAIA", sourceType: "saudi_official", url: null, sector: "default", skillTarget: "Digital Synthesis", bluf: "Mandatory AI governance creates a new compliance advisory market worth SAR 1B+|Government entities need policy frameworks, risk assessments, and training programs|Launch an 'AI Governance Accelerator' service targeting the top 20 government entities" },
    { headline: "PIF portfolio companies report 22% YoY revenue growth — performance management in focus", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa", sector: "default", skillTarget: "Value-Based P&L", bluf: "22% growth validates PIF's investment thesis but increases scrutiny on value realization|Portfolio companies need stronger performance management and reporting frameworks|Offer a 'Value Realization Dashboard' service to 5 flagship PIF companies this quarter" },
    { headline: "Deloitte opens new Riyadh mega-office — 500 consultants planned by end of 2026", source: "Deloitte", sourceType: "competitors", url: "https://www.deloitte.com", sector: "default", skillTarget: "Commercial Velocity", bluf: "Deloitte's expansion signals aggressive market capture — EY's talent pipeline is at risk|Client relationships may shift as Deloitte deploys sector-specific teams at scale|Accelerate EY's senior hiring and lock in key client relationships with multi-year engagements" },
  ],
};

interface TickerItem {
  headline: string;
  source: string;
  sourceType: string;
  url: string | null;
  sector: string;
  skillTarget: string;
  bluf: string;
}

interface SectorPulseTickerProps {
  onOpenChat?: (msg?: string) => void;
}

const SectorPulseTicker = ({ onOpenChat }: SectorPulseTickerProps) => {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<TickerItem | null>(null);
  const [userSector, setUserSector] = useState<string>("default");
  const [validating, setValidating] = useState(false);
  const { toast } = useToast();

  // Detect user sector from profile
  useEffect(() => {
    const detectSector = async () => {
      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("sector_focus, core_practice")
        .maybeSingle();

      if (!profile) {
        setUserSector("default");
      } else {
        const focus = ((profile as any).sector_focus || (profile as any).core_practice || "").toLowerCase();
        if (focus.includes("water") || focus.includes("utilit")) setUserSector("water");
        else if (focus.includes("financ") || focus.includes("bank")) setUserSector("finance");
        else if (focus.includes("energy") || focus.includes("oil")) setUserSector("energy");
        else if (focus.includes("tech") || focus.includes("digital")) setUserSector("tech");
        else setUserSector("default");
      }
    };
    detectSector();
  }, []);

  // Load sector-specific signals
  useEffect(() => {
    const sectorItems = SEED_SIGNALS[userSector] || SEED_SIGNALS.default;
    setItems(sectorItems);
  }, [userSector]);

  const sourceTypeColor = (type: string) => {
    switch (type) {
      case "saudi_official": return "text-emerald-400";
      case "pif": return "text-blue-400";
      case "saudi_press": return "text-amber-400";
      case "competitors": return "text-rose-400";
      case "ey": return "text-primary";
      default: return "text-muted-foreground";
    }
  };

  const sourceTypeLabel = (type: string) => {
    switch (type) {
      case "saudi_official": return "Official";
      case "pif": return "PIF";
      case "saudi_press": return "Press";
      case "competitors": return "Competitor";
      case "ey": return "EY Internal";
      default: return "Signal";
    }
  };

  const handleValidateSkill = useCallback(async (item: TickerItem) => {
    setValidating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await (supabase.from("learned_intelligence" as any) as any).insert({
        user_id: session.user.id,
        title: `Validated: ${item.headline.slice(0, 80)}`,
        content: `${item.bluf.replace(/\|/g, "\n")}\n\nSource: ${item.source} (${item.sourceType})`,
        intelligence_type: "trend",
        skill_pillars: [item.skillTarget],
        skill_boost_pct: 2,
        tags: ["sector-pulse", item.sourceType, userSector],
      });

      toast({
        title: "Skill Validated",
        description: `+2% boost to ${item.skillTarget} on your active profile.`,
      });
      setSelectedItem(null);
    } catch (err) {
      console.error("Validate failed:", err);
      toast({ title: "Error", description: "Could not validate skill.", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }, [userSector, toast]);

  return (
    <>
      {/* Ticker Bar */}
      <div
        className="overflow-hidden rounded-xl glass-card p-3 relative cursor-pointer"
        role="marquee"
      >
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] text-primary font-semibold tracking-widest uppercase">
            Live Sector Pulse
          </span>
          <span className="text-[9px] text-muted-foreground/40 ml-auto uppercase tracking-wider">
            {userSector === "default" ? "Multi-Sector" : userSector}
          </span>
        </div>
        <div className="flex gap-6 animate-marquee">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => setSelectedItem(item)}
              className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-2 hover:text-foreground transition-colors group"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                item.sourceType === "saudi_official" ? "bg-emerald-400" :
                item.sourceType === "pif" ? "bg-blue-400" :
                item.sourceType === "competitors" ? "bg-rose-400" :
                item.sourceType === "ey" ? "bg-primary" :
                "bg-primary/60"
              }`} />
              <span className="group-hover:underline underline-offset-2">{item.headline}</span>
            </button>
          ))}
        </div>

        {/* Source legend */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/5">
          {["saudi_official", "pif", "saudi_press", "competitors", "ey"].map((type) => (
            <div key={type} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${
                type === "saudi_official" ? "bg-emerald-400" :
                type === "pif" ? "bg-blue-400" :
                type === "saudi_press" ? "bg-amber-400" :
                type === "competitors" ? "bg-rose-400" :
                "bg-primary"
              }`} />
              <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">{sourceTypeLabel(type)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over Drawer */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent side="bottom" className="glass-card border-t border-border/20 rounded-t-3xl max-h-[85vh] overflow-y-auto pb-safe">
          {selectedItem && (
            <div className="pt-2 pb-6 px-1 space-y-5">
              {/* Header */}
              <SheetHeader className="text-left">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                    selectedItem.sourceType === "saudi_official" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    selectedItem.sourceType === "pif" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                    selectedItem.sourceType === "competitors" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                    selectedItem.sourceType === "ey" ? "bg-primary/10 text-primary border-primary/20" :
                    "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {sourceTypeLabel(selectedItem.sourceType)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">{selectedItem.source}</span>
                </div>
                <SheetTitle className="text-base font-semibold text-foreground leading-snug">
                  {selectedItem.headline}
                </SheetTitle>
              </SheetHeader>

              {/* BLUF */}
              <div className="p-4 rounded-xl bg-background/40 border border-border/10 space-y-3">
                <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">Director's BLUF</p>
                {selectedItem.bluf.split("|").map((bullet, bi) => {
                  const labels = ["The Shift", "The Impact", "The Action"];
                  return (
                    <div key={bi} className="flex items-start gap-2">
                      <span className="text-[9px] font-bold text-primary/60 uppercase whitespace-nowrap mt-0.5 min-w-[70px]">
                        {labels[bi] || "•"}
                      </span>
                      <span className="text-sm text-foreground/80 leading-relaxed">{bullet.trim()}</span>
                    </div>
                  );
                })}
              </div>

              {/* Source Link */}
              {selectedItem.url && (
                <a
                  href={selectedItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/5 border border-border/10 text-sm text-primary/70 hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>View Original Source</span>
                </a>
              )}

              {/* Deep Dive with Aura */}
              <button
                onClick={() => {
                  setSelectedItem(null);
                  onOpenChat?.(`Deep dive on: "${selectedItem.headline}" — What are the strategic implications for my ${userSector} practice?`);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-sm font-medium text-primary hover:bg-primary/15 transition-all tactile-press"
              >
                <MessageCircle className="w-4 h-4" />
                Deep Dive with Aura
              </button>

              {/* Validate Skill (+2%) */}
              <button
                onClick={() => handleValidateSkill(selectedItem)}
                disabled={validating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-all tactile-press"
              >
                {validating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                Validate Skill (+2%) — {selectedItem.skillTarget}
              </button>

              {/* Skill target context */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-muted-foreground/30 uppercase tracking-wider">
                  Applied to: {userSector === "default" ? "General" : userSector} profile only
                </span>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SectorPulseTicker;
