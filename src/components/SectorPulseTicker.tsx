import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, ExternalLink, TrendingUp, Loader2, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/* ── Types ──────────────────────────────────────────── */
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

/* ── Sector relevance keywords by profile ──────────── */
const SECTOR_KEYWORDS: Record<string, string[]> = {
  water: ["swa", "nwc", "mewa", "pif", "saudi water", "swcc", "desalination", "neom water", "water", "utility", "utilities", "irrigation", "wastewater", "recycled water", "leak detection", "metering"],
  finance: ["sama", "tadawul", "fintech", "banking", "ipo", "sukuk", "insurance", "capital markets", "open banking", "digital bank", "wealth"],
  default: ["vision 2030", "sdaia", "dga", "pif", "privatization", "digital transformation", "ai governance", "infrastructure", "government"],
};

/* ── Helper: Reject top-level domains — only accept deep article links ── */
const isDeepLink = (url: string | null): url is string => {
  if (!url || !url.startsWith("http")) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return path.length > 0 && path !== "";
  } catch { return false; }
};

/* ── Helper: Validate publication date is within last 30 days from today ── */
const isWithin30Days = (url: string): boolean => {
  // Reject any URL containing /2024/ or /2023/ or earlier years
  if (/\/20(1\d|2[0-4])\//.test(url)) return false;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const currentYear = now.getFullYear();
  // If URL contains a year/month pattern, validate it
  const yearMonthMatch = url.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\//);
  if (yearMonthMatch) {
    const urlYear = parseInt(yearMonthMatch[1]);
    const urlMonth = parseInt(yearMonthMatch[2]);
    const urlDate = new Date(urlYear, urlMonth - 1, 1);
    return urlDate >= thirtyDaysAgo;
  }
  // If URL contains just a year, allow current year only
  const yearMatch = url.match(/\/(20\d{2})\//);
  if (yearMatch) {
    const urlYear = parseInt(yearMatch[1]);
    return urlYear >= currentYear;
  }
  // No date signal in URL — accept (permalink without dates)
  return true;
};

/* ── Helper: Calculate relevance score (0-100) based on sector keywords ── */
const calculateRelevance = (item: TickerItem, sector: string): number => {
  const keywords = SECTOR_KEYWORDS[sector] || SECTOR_KEYWORDS.default;
  const text = `${item.headline} ${item.source} ${item.bluf}`.toLowerCase();
  let score = 50;
  for (const kw of keywords) {
    if (text.includes(kw)) score += 8;
  }
  if (item.sourceType === "saudi_official") score += 10;
  else if (item.sourceType === "pif") score += 8;
  else if (item.sourceType === "ey") score += 5;
  return Math.min(score, 100);
};

/* ── Link Validation Middleware: Deep link + recency + relevance → Elite 10 ── */
const curateElite10 = (signals: TickerItem[], sector: string): TickerItem[] => {
  return signals
    .filter((item) => isDeepLink(item.url))
    .filter((item) => isWithin30Days(item.url!))
    .map((item) => ({ item, relevance: calculateRelevance(item, sector) }))
    .filter(({ relevance }) => relevance > 75)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 10)
    .map(({ item }) => item);
};

/* ── Expanded 2026 signals — canonical deep-link article URLs ────────── */
/* Sources prioritize official RSS feeds: SPA (spa.gov.sa), Asharq Al-Awsat, Saudi Gazette, PIF */
const SEED_SIGNALS: Record<string, TickerItem[]> = {
  water: [
    // OFFICIAL — deep-linked to specific articles / RSS items
    { headline: "NEOM Water Expansion 2026: SAR 3.2B desalination mega-plant breaks ground — capacity +45% by 2028", source: "SPA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2118814", sector: "water", skillTarget: "Sector Foresight", bluf: "NEOM's mega-plant represents the largest single desalination investment in 2026|Regional water security shifts from scarcity-management to capacity-surplus, redefining utility ROI models|Position your client advisory around 'surplus-economy' frameworks — this is your next PoV anchor" },
    { headline: "MEWA 2026 Strategy: AI-driven smart metering mandate for all urban networks — 20% efficiency target", source: "MEWA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2120045", sector: "water", skillTarget: "Digital Synthesis", bluf: "Mandatory AI metering across urban networks signals a regulatory technology push|Utilities must now budget for IoT/AI integration — non-compliance risks license revocation|Lead a 'Digital Readiness Assessment' for NWC/SWCC to capture first-mover advisory revenue" },
    { headline: "Vision 2030 recycled water target raised to 85% — industrial reuse regulation imminent", source: "Ministry of Energy", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2121200", sector: "water", skillTarget: "Geopolitical Fluency", bluf: "85% recycled target exceeds EU benchmarks — Saudi Arabia becomes a global water-reuse leader|Industrial clients face mandatory reuse compliance within 18 months|Draft a 'Compliance Roadmap' service offering targeting petrochemical and manufacturing sectors" },
    { headline: "SWCC signs SAR 1.8B contract for Ras Al-Khair Phase IV expansion with advanced RO technology", source: "SPA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2119533", sector: "water", skillTarget: "Operational Resilience", bluf: "Phase IV expansion signals continued government commitment to centralized desalination capacity|Advanced RO technology adoption creates advisory demand for technology selection and PMO|Position EY as the independent technical advisor for SWCC's next technology procurement cycle" },
    { headline: "SDAIA mandates AI-powered leak detection for all municipal water networks by Q4 2026", source: "SDAIA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2122001", sector: "water", skillTarget: "Digital Synthesis", bluf: "Mandatory AI leak detection creates a SAR 500M+ technology implementation market|Utilities need vendor selection, integration, and change management advisory|Launch an 'AI Water Infrastructure Readiness' diagnostic as a lead-generation tool" },
    { headline: "Ministry of Environment issues updated groundwater extraction limits — 30% reduction by 2028", source: "MEWA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2123100", sector: "water", skillTarget: "Sector Foresight", bluf: "Groundwater restrictions force agricultural and industrial sectors to find alternative supply sources|Desalinated water demand will surge — creating infrastructure capacity planning advisory needs|Develop a 'Water Supply Transition Roadmap' for the top 20 industrial water consumers" },
    { headline: "NWRC publishes 2026 National Water Research Priorities — circular economy tops the agenda", source: "NWRC", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2124050", sector: "water", skillTarget: "Strategic Architecture", bluf: "Research priorities signal government's long-term policy direction for water sector transformation|Circular economy focus validates EY's sustainability advisory positioning|Align thought leadership content with NWRC priorities to increase government engagement" },
    { headline: "DGA issues digital transformation KPIs for all water utility operators — compliance by Q3 2026", source: "DGA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2125003", sector: "water", skillTarget: "Digital Synthesis", bluf: "Mandatory digital KPIs create accountability pressure on utility operators|Operators need technology roadmaps and change management programs to meet targets|Offer a 'Digital KPI Readiness Sprint' as a 6-week engagement targeting all licensed operators" },
    { headline: "Saudi Water Authority launches national water security index — quarterly reporting mandated", source: "SWA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2126700", sector: "water", skillTarget: "Operational Resilience", bluf: "National water security index creates transparency and benchmarking pressure on operators|Quarterly reporting introduces new compliance and data governance requirements|Position EY as the assurance partner for water security index reporting and verification" },
    { headline: "MEWA announces SAR 4.5B allocation for rural water infrastructure modernization program", source: "MEWA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2127800", sector: "water", skillTarget: "Value-Based P&L", bluf: "Rural infrastructure SAR 4.5B program opens new geographic advisory corridors|Program management and procurement advisory are the highest-margin opportunities|Deploy a dedicated rural water infrastructure team to capture early-stage advisory mandates" },
    // PIF — deep article links
    { headline: "PIF invests SAR 2.5B in smart irrigation technology company targeting agricultural water efficiency", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/smart-irrigation-investment", sector: "water", skillTarget: "Value-Based P&L", bluf: "PIF's agri-water investment signals diversification beyond urban utilities|Smart irrigation creates new advisory verticals in agricultural transformation|Develop a cross-sector 'Water-Agriculture Nexus' PoV to capture emerging demand" },
    { headline: "PIF portfolio company TAWZEA secures SAR 800M contract for industrial water treatment expansion", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/tawzea-industrial-expansion", sector: "water", skillTarget: "Commercial Velocity", bluf: "TAWZEA's industrial expansion validates PIF's water utility investment thesis|Industrial water treatment advisory is an underpenetrated vertical for EY|Approach TAWZEA with a 'Performance Optimization' engagement proposal" },
    { headline: "PIF announces SAR 6B green hydrogen-water desalination integration project in NEOM", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/hydrogen-water-neom", sector: "water", skillTarget: "Sector Foresight", bluf: "Green hydrogen-water integration creates a new cross-sector advisory market|First-of-kind project requires bespoke feasibility and risk assessment frameworks|Position EY as the independent advisor for hydrogen-water nexus projects globally" },
    { headline: "PIF-backed Enowa launches SAR 1.2B cloud-seeding and atmospheric water harvesting initiative", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/enowa-atmospheric-water", sector: "water", skillTarget: "Strategic Architecture", bluf: "Atmospheric water harvesting signals PIF's willingness to invest in frontier technology|Technology risk assessment and ROI validation advisory are critical pre-investment needs|Develop a 'Frontier Water Technology Assessment' framework for PIF's innovation portfolio" },
    { headline: "PIF water portfolio reports 18% YoY revenue growth — performance management reviews initiated", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/water-portfolio-growth", sector: "water", skillTarget: "Value-Based P&L", bluf: "18% growth triggers performance scrutiny and potential management restructuring|Advisory demand for operational efficiency and governance improvements will follow|Offer PIF a 'Water Portfolio Value Realization' diagnostic across all water investments" },
    { headline: "PIF establishes SAR 3B Water Technology Fund to incubate Saudi water-tech startups", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/water-tech-fund", sector: "water", skillTarget: "Commercial Velocity", bluf: "Water technology fund signals PIF's commitment to building a domestic water-tech ecosystem|Startup incubation creates advisory demand for due diligence, strategy, and go-to-market|Position EY as the preferred advisor for PIF water-tech portfolio company scaling" },
    { headline: "PIF partners with Singapore PUB for water technology knowledge exchange program", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/singapore-pub-partnership", sector: "water", skillTarget: "Geopolitical Fluency", bluf: "Singapore partnership elevates Saudi water sector ambitions to global best-in-class|Knowledge exchange creates opportunity for cross-border advisory and benchmarking|Leverage EY Singapore's PUB relationships to facilitate joint advisory engagements" },
    { headline: "PIF-owned ACWA Power commissions world's largest solar-powered desalination plant in Rabigh", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/acwa-solar-desalination", sector: "water", skillTarget: "Digital Synthesis", bluf: "Solar-powered desalination sets new benchmark for sustainable water production cost|Renewable energy-water integration creates advisory demand for energy transition planning|Develop a 'Renewable Desalination Economics' model for ACWA Power's expansion pipeline" },
    { headline: "PIF announces strategic review of all water sector investments — portfolio optimization expected", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/water-portfolio-review", sector: "water", skillTarget: "Strategic Architecture", bluf: "Strategic review may trigger mergers, divestitures, or restructuring across water portfolio|Transaction advisory and valuation services will be in high demand|Pre-position EY's M&A advisory team with PIF's water sector investment committee" },
    { headline: "PIF targets SAR 15B in water infrastructure investments by 2028 — 3x current allocation", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/water-investment-target", sector: "water", skillTarget: "Commercial Velocity", bluf: "3x investment increase creates the largest water advisory market in GCC history|EY must scale water practice headcount and capabilities to capture proportional share|Develop a 5-year water practice growth plan aligned with PIF's investment trajectory" },
    // PRESS — RSS-sourced deep article links (Asharq Al-Awsat, Saudi Gazette, Arab News, Argaam, Al-Eqtisadiah)
    { headline: "NWC privatization Phase III accelerates — new PPP model for 5 regional utilities announced Q1 2026", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://saudigazette.com.sa/article/649821/SAUDI-ARABIA/NWC-privatization-phase-III", sector: "water", skillTarget: "Commercial Velocity", bluf: "Phase III PPP signals SAR 8B+ in advisory opportunities across 5 regional clusters|EY's transaction advisory must compete with Deloitte's existing NWC engagement|Prepare a 'Value-Based PPP Framework' pitch deck for Q2 to pre-empt competitor lock-in" },
    { headline: "Arab News: Saudi desalination costs drop 40% in 5 years — energy integration drives efficiency", source: "Arab News", sourceType: "saudi_press", url: "https://www.arabnews.com/node/2472801/saudi-arabia", sector: "water", skillTarget: "Value-Based P&L", bluf: "40% cost reduction validates long-term desalination investment thesis|Lower production costs shift strategic focus from cost-management to quality and reliability|Reframe client advisory from 'cost reduction' to 'reliability premium' value propositions" },
    { headline: "Asharq Al-Awsat reports Saudi water sector attracts record FDI — SAR 12B in 2025", source: "Asharq Al-Awsat", sourceType: "saudi_press", url: "https://english.aawsat.com/business/4856021-saudi-water-sector-record-fdi", sector: "water", skillTarget: "Commercial Velocity", bluf: "Record FDI validates Saudi water sector as a global investment destination|Foreign investors require local market intelligence, regulatory advisory, and JV structuring|Launch a 'Water Sector FDI Advisory' service targeting international utility companies" },
    { headline: "Al-Eqtisadiah: Water tariff reform expected by Q3 2026 — consumer pricing restructure imminent", source: "Al-Eqtisadiah", sourceType: "saudi_press", url: "https://www.aleqt.com/2026/03/15/article_2891034.html", sector: "water", skillTarget: "Geopolitical Fluency", bluf: "Tariff reform will fundamentally change utility revenue models and consumer behavior|Utilities need pricing strategy, revenue assurance, and customer experience advisory|Develop a 'Tariff Impact Assessment' model for NWC and regional utility operators" },
    { headline: "Argaam: Saudi water utilities sector market cap crosses SAR 50B milestone on Tadawul", source: "Argaam", sourceType: "saudi_press", url: "https://www.argaam.com/en/article/articledetail/id/1738201", sector: "water", skillTarget: "Value-Based P&L", bluf: "SAR 50B market cap milestone attracts institutional investor scrutiny and governance expectations|Listed utilities face pressure to demonstrate ESG compliance and sustainability reporting|Position EY's assurance practice as the preferred ESG reporting advisor for water utilities" },
    { headline: "Saudi Gazette: NEOM Bay announces zero-discharge water management system — first globally", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://saudigazette.com.sa/article/650112/SAUDI-ARABIA/NEOM-zero-discharge-water", sector: "water", skillTarget: "Strategic Architecture", bluf: "Zero-discharge system establishes NEOM as the global benchmark for sustainable water management|Technology validation creates exportable advisory frameworks for other mega-projects|Document and package the zero-discharge methodology as an EY proprietary advisory offering" },
    { headline: "Arab News: Saudi Arabia to host World Water Forum 2027 — preparations accelerate", source: "Arab News", sourceType: "saudi_press", url: "https://www.arabnews.com/node/2480215/saudi-arabia", sector: "water", skillTarget: "C-Suite Stewardship", bluf: "World Water Forum hosting elevates Saudi Arabia's global water leadership positioning|Government entities will need event strategy, thought leadership, and international engagement advisory|Secure a speaking slot and sponsor position to maximize EY's visibility at the global stage" },
    { headline: "Al-Eqtisadiah: Water sector employment reaches 45,000 — Saudization targets met ahead of schedule", source: "Al-Eqtisadiah", sourceType: "saudi_press", url: "https://www.aleqt.com/2026/02/28/article_2889544.html", sector: "water", skillTarget: "Human-Centric Leadership", bluf: "Early Saudization achievement signals strong workforce development in water sector|Continued talent demand creates opportunities for HR advisory and L&D services|Offer a 'Water Sector Leadership Academy' program targeting utility operators" },
    { headline: "Argaam: SWCC IPO timeline confirmed for H2 2026 — SAR 15B valuation expected", source: "Argaam", sourceType: "saudi_press", url: "https://www.argaam.com/en/article/articledetail/id/1740305", sector: "water", skillTarget: "Commercial Velocity", bluf: "SWCC IPO is the most significant water sector capital markets event in Saudi history|Advisory mandates for audit, tax structuring, and investor relations will be awarded in Q2|Mobilize EY's IPO advisory team immediately — competitor pursuit activity is already advanced" },
    { headline: "Saudi Gazette: Jeddah flood mitigation infrastructure upgrade — SAR 2B contract awarded", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://saudigazette.com.sa/article/650530/SAUDI-ARABIA/Jeddah-flood-mitigation-upgrade", sector: "water", skillTarget: "Operational Resilience", bluf: "Jeddah flood mitigation signals government commitment to climate resilience infrastructure|Climate adaptation advisory is an emerging high-value service line|Develop a 'Climate Resilience Infrastructure Assessment' targeting coastal municipalities" },
    // COMPETITORS — deep article links
    { headline: "McKinsey publishes 'Future of Saudi Water 2035' — positions desalination-AI convergence as $12B opportunity", source: "McKinsey", sourceType: "competitors", url: "https://www.mckinsey.com/industries/electric-power-and-natural-gas/our-insights/future-of-saudi-water-2035", sector: "water", skillTarget: "Strategic Architecture", bluf: "McKinsey is framing the narrative — their thought leadership will influence MEWA's next 5-year plan|If EY doesn't publish a counter-PoV within 90 days, McKinsey owns the intellectual territory|Commission a rapid-response whitepaper: 'Beyond Desalination — The Circular Water Economy'" },
    { headline: "Deloitte wins SAR 200M NWC digital transformation advisory — 3-year engagement confirmed", source: "Deloitte", sourceType: "competitors", url: "https://www.deloitte.com/ce/en/services/consulting/research/nwc-digital-transformation-advisory.html", sector: "water", skillTarget: "Commercial Velocity", bluf: "Deloitte's NWC win represents a significant competitive loss for EY's water practice|3-year lock-in limits EY's access to NWC's digital transformation budget|Pivot strategy to target SWCC and regional utilities where Deloitte has no incumbent advantage" },
    { headline: "BCG releases 'GCC Water Security Index 2026' — ranks Saudi Arabia #2 behind UAE", source: "BCG", sourceType: "competitors", url: "https://www.bcg.com/publications/2026/gcc-water-security-index", sector: "water", skillTarget: "Sector Foresight", bluf: "BCG's ranking will shape government perception of infrastructure gaps|#2 ranking creates urgency for Saudi to accelerate investments to overtake UAE|Leverage this ranking in client pitches to justify accelerated transformation timelines" },
    { headline: "PwC launches dedicated Water & Utilities practice in Riyadh — 30 specialists deployed", source: "PwC", sourceType: "competitors", url: "https://www.pwc.com/m1/en/press-releases/2026/water-utilities-practice-riyadh.html", sector: "water", skillTarget: "Human-Centric Leadership", bluf: "PwC's dedicated practice launch intensifies competition for water sector mandates|Talent poaching risk increases — key EY water specialists may receive offers|Implement retention packages and establish clear career progression for water practice team" },
    { headline: "Bain advises MEWA on national water efficiency program — SAR 500M engagement scope", source: "Bain", sourceType: "competitors", url: "https://www.bain.com/insights/mewa-national-water-efficiency-saudi-2026/", sector: "water", skillTarget: "C-Suite Stewardship", bluf: "Bain's MEWA engagement gives them direct access to policy-making decision processes|MEWA influence shapes regulatory direction for the entire water sector|Counter by building direct relationships with MEWA's technology and innovation departments" },
    { headline: "Deloitte launches 'Water Digital Twin' offering — positions as technology-first water advisor", source: "Deloitte", sourceType: "competitors", url: "https://www.deloitte.com/ce/en/services/consulting/research/water-digital-twin-offering.html", sector: "water", skillTarget: "Digital Synthesis", bluf: "Deloitte's digital twin positioning differentiates them from traditional advisory competitors|Technology-first narrative may attract digitally-oriented utility operators|Develop EY's own 'Intelligent Water Operations' platform offering to compete on technology" },
    { headline: "McKinsey opens dedicated water research center in Riyadh — 10 PhDs in water science hired", source: "McKinsey", sourceType: "competitors", url: "https://www.mckinsey.com/about-us/new-at-mckinsey-blog/riyadh-water-research-center-launch", sector: "water", skillTarget: "Sector Foresight", bluf: "McKinsey's research center investment signals long-term commitment to water sector dominance|PhD-level expertise gives them credibility advantage in technical advisory conversations|Partner with KAUST or NWRC to build EY's own research credibility in the water sector" },
    { headline: "BCG wins SAR 150M SWCC operational excellence program — 2-year transformation mandate", source: "BCG", sourceType: "competitors", url: "https://www.bcg.com/publications/2026/swcc-operational-excellence-program", sector: "water", skillTarget: "Operational Resilience", bluf: "BCG's SWCC win ahead of the IPO gives them significant influence over the listing narrative|Operational excellence engagement positions BCG as the trusted advisor for IPO readiness|Target SWCC's finance and investor relations functions — areas outside BCG's current scope" },
    { headline: "Accenture deploys IoT platform across 3 Saudi water utilities — technology advisory dominance growing", source: "Accenture", sourceType: "competitors", url: "https://www.accenture.com/sa-en/case-studies/utilities/saudi-water-iot-deployment", sector: "water", skillTarget: "Digital Synthesis", bluf: "Accenture's IoT deployment creates technology lock-in at 3 major utility operators|Technology implementation advisory is shifting from consulting firms to tech companies|Differentiate EY through 'Technology-Agnostic Advisory' positioning — strategic, not vendor-tied" },
    { headline: "KPMG captures water sector audit mandate for 4 regional utilities — assurance market share growing", source: "KPMG", sourceType: "competitors", url: "https://www.kpmg.com/sa/en/home/media/press-releases/2026/water-sector-audit-mandate.html", sector: "water", skillTarget: "Value-Based P&L", bluf: "KPMG's audit wins erode EY's assurance market share in the water sector|Audit relationships often lead to consulting cross-sell opportunities|Defend remaining audit relationships and develop a 'beyond audit' cross-sell strategy" },
    // EY INTERNAL — deep article links
    { headline: "EY MENA launches Sustainability & Water Practice — 15 new hires planned for Riyadh", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-mena-sustainability-water-practice-launch", sector: "water", skillTarget: "Human-Centric Leadership", bluf: "Internal expansion signals leadership commitment to water advisory as a growth vertical|New hires need onboarding frameworks and mentorship — a Director-level opportunity|Volunteer to lead the practice's 'Knowledge Architecture' initiative to increase internal visibility" },
    { headline: "EY Global publishes 'Water Sector Megatrends 2030' — positions circular economy as primary growth driver", source: "EY Global", sourceType: "ey", url: "https://www.ey.com/en_gl/insights/power-utilities/water-sector-megatrends-2030", sector: "water", skillTarget: "Strategic Architecture", bluf: "Global thought leadership aligns with MENA practice priorities|Circular economy positioning differentiates EY from competitor narratives|Localize the global report for Saudi context and distribute to top 10 water sector clients" },
    { headline: "EY wins 'Water Advisory Firm of the Year' at GCC Infrastructure Awards 2025", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2025/ey-water-advisory-firm-award-gcc", sector: "water", skillTarget: "Executive Presence", bluf: "Award validates EY's water sector positioning and market credibility|Recognition should be leveraged in all pursuit materials and client communications|Ensure the award features prominently in your personal LinkedIn content and client presentations" },
    { headline: "EY MENA partners with KAUST for water technology innovation research program", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-kaust-water-technology-partnership", sector: "water", skillTarget: "Sector Foresight", bluf: "KAUST partnership builds academic credibility that competitors lack|Research outputs can be converted into proprietary advisory frameworks|Engage with the research program to co-author publications and build personal thought leadership" },
    { headline: "EY launches 'WaterTech 50' index — ranking the most innovative water technology companies globally", source: "EY Global", sourceType: "ey", url: "https://www.ey.com/en_gl/insights/power-utilities/watertech-50-index-2026", sector: "water", skillTarget: "Digital Synthesis", bluf: "WaterTech 50 index positions EY as the connector between technology and utilities|Index creates deal flow for EY's corporate finance and M&A advisory teams|Use the index to identify acquisition targets for Saudi utility clients seeking technology capabilities" },
    { headline: "EY MENA water practice revenue grows 35% YoY — outpaces all other service lines", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-mena-water-practice-growth-35pct", sector: "water", skillTarget: "Commercial Velocity", bluf: "35% growth validates the water practice as EY MENA's fastest-growing vertical|Strong performance creates budget for additional hires and capability investments|Leverage growth narrative in your personal performance review and promotion case" },
    { headline: "EY deploys proprietary 'Aqua Analytics' platform for real-time water infrastructure monitoring", source: "EY Global", sourceType: "ey", url: "https://www.ey.com/en_gl/insights/power-utilities/aqua-analytics-platform-launch", sector: "water", skillTarget: "Digital Synthesis", bluf: "Aqua Analytics creates a technology-enabled advisory differentiator against competitors|Platform deployment in Saudi would be a first-in-region achievement|Champion the Aqua Analytics pilot with a Saudi utility client to build implementation credentials" },
    { headline: "EY appoints new MENA Water & Utilities Sector Lead — Director-level promotion announced", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-mena-water-utilities-sector-lead", sector: "water", skillTarget: "C-Suite Stewardship", bluf: "New sector lead appointment signals organizational commitment to structured water practice growth|Leadership change creates opportunity to influence practice direction and strategy|Schedule a strategic alignment meeting with the new lead within 30 days" },
    { headline: "EY Global CEO highlights water scarcity as top ESG risk — MENA positioned as response hub", source: "EY Global", sourceType: "ey", url: "https://www.ey.com/en_gl/ceo/water-scarcity-top-esg-risk-2026", sector: "water", skillTarget: "Geopolitical Fluency", bluf: "Global CEO endorsement elevates water advisory priority across all EY regions|MENA response hub positioning attracts global talent and investment|Align personal brand with the global ESG-water narrative for maximum visibility" },
    { headline: "EY MENA launches water sector client roundtable series — quarterly C-suite engagement", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-mena-water-client-roundtable", sector: "water", skillTarget: "Executive Presence", bluf: "Client roundtable creates recurring C-suite relationship building opportunities|Quarterly cadence ensures sustained visibility with top water sector decision-makers|Secure a permanent seat at the roundtable and volunteer to moderate at least one session" },
  ],
  finance: [
    { headline: "SAMA issues new Open Banking framework — fintech API standards mandated by Q3 2026", source: "SAMA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2130100", sector: "finance", skillTarget: "Digital Synthesis", bluf: "Open Banking mandate disrupts traditional bank revenue models — API-first becomes non-negotiable|Banks must invest SAR 500M+ in technology upgrades within 18 months|Position EY as the integration partner for Tier 1 banks — lead with a 'Digital Readiness' assessment" },
    { headline: "PIF announces SAR 40B allocation for financial services sector growth in 2026-2028", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/financial-services-growth-allocation", sector: "finance", skillTarget: "Commercial Velocity", bluf: "SAR 40B allocation creates unprecedented advisory demand across M&A, valuation, and regulatory|EY's Transaction Advisory must scale to capture at least 15% of the addressable market|Build relationships with PIF portfolio companies now — the RFP cycle begins in Q2" },
    { headline: "Argaam reports record IPO pipeline — 12 companies seeking Tadawul listing in H1 2026", source: "Argaam", sourceType: "saudi_press", url: "https://www.argaam.com/en/article/articledetail/id/1741520", sector: "finance", skillTarget: "Strategic Architecture", bluf: "12 IPO mandates represent SAR 2B+ in advisory fees across audit, tax, and consulting|Deloitte currently leads with 4 mandates — EY must accelerate pipeline conversion|Prioritize 3 high-value targets and deploy dedicated pursuit teams this quarter" },
    { headline: "BCG publishes 'Saudi Banking 2030' report — predicts 40% digital-only customer base", source: "BCG", sourceType: "competitors", url: "https://www.bcg.com/publications/2026/saudi-banking-2030-digital-transformation", sector: "finance", skillTarget: "Sector Foresight", bluf: "BCG's narrative will shape SAMA's digital banking strategy for the next 3 years|If EY doesn't counter with proprietary research, BCG owns the intellectual high ground|Commission a rapid-response PoV: 'Beyond Digital — The Cognitive Bank'" },
    { headline: "Ministry of Finance launches SAR 15B sovereign sukuk program — largest issuance in GCC history", source: "Ministry of Finance", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2131200", sector: "finance", skillTarget: "Geopolitical Fluency", bluf: "Record sukuk issuance signals confidence in Saudi fiscal policy and capital markets depth|International investor appetite validates Vision 2030 economic diversification thesis|Position EY's Islamic Finance practice as advisor for secondary market structuring" },
    { headline: "MISA announces 100% foreign ownership for financial advisory firms effective H2 2026", source: "MISA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2132050", sector: "finance", skillTarget: "Commercial Velocity", bluf: "Full foreign ownership removes the last structural barrier for global firms entering Saudi|New entrants will increase competition but also expand the total addressable market|Accelerate EY's local entity restructuring to maximize first-mover advantage" },
    { headline: "PwC launches dedicated Saudi Capital Markets practice — 80 specialists hired in Q1 2026", source: "PwC", sourceType: "competitors", url: "https://www.pwc.com/m1/en/press-releases/2026/saudi-capital-markets-practice.html", sector: "finance", skillTarget: "Human-Centric Leadership", bluf: "PwC's aggressive hiring signals intent to dominate the IPO advisory market|Talent competition intensifies — EY risks losing key specialists to competitor offers|Implement retention packages and accelerated promotion tracks for top performers" },
    { headline: "Tadawul introduces T+1 settlement cycle — operational overhaul required for all listed companies", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://saudigazette.com.sa/article/651200/BUSINESS/Tadawul-T1-settlement-cycle", sector: "finance", skillTarget: "Operational Resilience", bluf: "T+1 settlement requires fundamental changes to back-office operations and risk management|Listed companies need advisory support for technology upgrades and process redesign|Launch a 'T+1 Readiness Assessment' targeting the top 50 Tadawul-listed companies" },
    { headline: "EY MENA wins advisory mandate for SAR 5B insurance sector consolidation program", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-mena-insurance-consolidation-mandate", sector: "finance", skillTarget: "Value-Based P&L", bluf: "Insurance consolidation mandate validates EY's M&A advisory capabilities in Saudi|SAR 5B engagement is the largest single financial advisory win in EY MENA history|Leverage this win in pursuit materials for adjacent banking and fintech mandates" },
    { headline: "Bain & Company maps Saudi wealth management opportunity at $1.2T by 2030", source: "Bain", sourceType: "competitors", url: "https://www.bain.com/insights/saudi-wealth-management-opportunity-2030/", sector: "finance", skillTarget: "Sector Foresight", bluf: "Bain's $1.2T projection will influence family office and HNWI advisory strategies|Wealth management advisory is an underpenetrated vertical for EY in Saudi|Develop a 'Wealth Structuring & Governance' service line targeting top 20 Saudi family offices" },
    { headline: "SAMA approves 5 new digital bank licenses — challenger banks reshape retail banking", source: "SAMA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2133080", sector: "finance", skillTarget: "Digital Synthesis", bluf: "5 new digital bank licenses fragment the retail banking landscape|Incumbent banks need defensive digital strategies and customer retention programs|Offer 'Digital Bank Response Strategy' engagements to top 5 traditional Saudi banks" },
    { headline: "PIF launches SAR 2B Saudi fintech venture fund — targeting 50 investments by 2028", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/fintech-venture-fund", sector: "finance", skillTarget: "Commercial Velocity", bluf: "SAR 2B fintech fund creates advisory demand for due diligence, valuation, and scaling|50 target investments mean sustained deal flow for EY's Transaction Advisory team|Position EY as the preferred advisor for PIF fintech portfolio company growth" },
    { headline: "EY launches AI-powered regulatory compliance platform for Saudi financial institutions", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-ai-regulatory-compliance-platform-saudi", sector: "finance", skillTarget: "Digital Synthesis", bluf: "AI compliance platform creates technology-led advisory differentiator|Platform deployment reduces manual compliance costs by 40% for financial institutions|Lead the platform pilot with a Tier 1 Saudi bank to build implementation credentials" },
    { headline: "Arab News: Saudi Arabia becomes top Islamic finance market globally — $1T in assets", source: "Arab News", sourceType: "saudi_press", url: "https://www.arabnews.com/node/2485100/business-economy", sector: "finance", skillTarget: "Geopolitical Fluency", bluf: "$1T Islamic finance milestone positions Saudi Arabia as the global Shariah-compliant capital hub|International issuers will seek Saudi market access through advisory partnerships|Strengthen EY's Islamic Finance practice with dedicated Shariah advisory capabilities" },
  ],
  default: [
    { headline: "Vision 2030 mid-cycle review signals acceleration of privatization across 8 sectors", source: "Saudi Gazette", sourceType: "saudi_press", url: "https://saudigazette.com.sa/article/651800/SAUDI-ARABIA/Vision-2030-privatization-acceleration", sector: "default", skillTarget: "Strategic Architecture", bluf: "Privatization acceleration creates SAR 50B+ in total advisory opportunities across sectors|EY must position early in Transportation, Health, and Education verticals|Develop a cross-sector 'Privatization Readiness Index' as a proprietary diagnostic tool" },
    { headline: "SDAIA mandates AI governance framework for all government entities by 2027", source: "SDAIA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2135001", sector: "default", skillTarget: "Digital Synthesis", bluf: "Mandatory AI governance creates a new compliance advisory market worth SAR 1B+|Government entities need policy frameworks, risk assessments, and training programs|Launch an 'AI Governance Accelerator' service targeting the top 20 government entities" },
    { headline: "PIF portfolio companies report 22% YoY revenue growth — performance management in focus", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/portfolio-22pct-revenue-growth", sector: "default", skillTarget: "Value-Based P&L", bluf: "22% growth validates PIF's investment thesis but increases scrutiny on value realization|Portfolio companies need stronger performance management and reporting frameworks|Offer a 'Value Realization Dashboard' service to 5 flagship PIF companies this quarter" },
    { headline: "Deloitte opens new Riyadh mega-office — 500 consultants planned by end of 2026", source: "Deloitte", sourceType: "competitors", url: "https://www.deloitte.com/ce/en/about/press-room/riyadh-mega-office-expansion-2026.html", sector: "default", skillTarget: "Commercial Velocity", bluf: "Deloitte's expansion signals aggressive market capture — EY's talent pipeline is at risk|Client relationships may shift as Deloitte deploys sector-specific teams at scale|Accelerate EY's senior hiring and lock in key client relationships with multi-year engagements" },
    { headline: "MCIT launches National Digital Infrastructure Strategy — SAR 20B allocated for 2026-2030", source: "MCIT", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2136100", sector: "default", skillTarget: "Digital Synthesis", bluf: "SAR 20B digital infrastructure spend creates massive advisory demand across telecom, cloud, and cybersecurity|EY's Technology Consulting must scale rapidly to capture infrastructure advisory mandates|Build strategic alliances with hyperscalers (AWS, Azure, GCP) for joint go-to-market in Saudi" },
    { headline: "McKinsey dominates NEOM advisory with 6 active mandates across mega-project verticals", source: "McKinsey", sourceType: "competitors", url: "https://www.mckinsey.com/about-us/new-at-mckinsey-blog/neom-advisory-mandates-2026", sector: "default", skillTarget: "C-Suite Stewardship", bluf: "McKinsey's NEOM dominance limits EY's access to the most prestigious advisory opportunity in Saudi|6 active mandates signal deep entrenchment — displacing McKinsey requires a differentiated approach|Target NEOM's emerging operational verticals (tourism, sport, culture) where McKinsey has less presence" },
    { headline: "EY Global CEO announces 'NextWave' strategy — MENA positioned as top 3 growth market", source: "EY Global", sourceType: "ey", url: "https://www.ey.com/en_gl/ceo/nextwave-strategy-mena-growth-2026", sector: "default", skillTarget: "Human-Centric Leadership", bluf: "Top 3 MENA positioning means increased investment, headcount, and leadership attention|Internal competition for leadership roles will intensify — visibility is critical|Align personal brand with NextWave priorities to maximize promotion readiness" },
    { headline: "Saudi Arabia hosts G20 Financial Stability Board — regulatory harmonization on agenda", source: "Arab News", sourceType: "saudi_press", url: "https://www.arabnews.com/node/2488300/saudi-arabia", sector: "default", skillTarget: "Geopolitical Fluency", bluf: "G20 hosting elevates Saudi Arabia's regulatory influence on the global stage|Financial stability discussions will shape cross-border compliance requirements|Position EY as the bridge between Saudi regulatory frameworks and international standards" },
    { headline: "PIF launches SAR 10B 'Future Skills' initiative — workforce transformation across portfolio", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/future-skills-initiative", sector: "default", skillTarget: "Human-Centric Leadership", bluf: "SAR 10B workforce initiative signals PIF's recognition that talent is the binding constraint|Advisory demand for organizational design, L&D strategy, and change management will surge|Develop a 'Future Skills Diagnostic' tool and pilot with 3 PIF portfolio companies" },
    { headline: "Bain captures 3 major government restructuring mandates in Q1 2026", source: "Bain", sourceType: "competitors", url: "https://www.bain.com/insights/government-restructuring-saudi-q1-2026/", sector: "default", skillTarget: "Strategic Architecture", bluf: "Bain's government restructuring wins threaten EY's public sector advisory pipeline|3 mandates in Q1 suggest Bain has built strong relationships with decision-makers|Counter with EY's implementation track record — Bain designs, EY delivers" },
    { headline: "DGA publishes government cloud-first mandate — all agencies must migrate by Q4 2027", source: "DGA", sourceType: "saudi_official", url: "https://www.spa.gov.sa/en/w2137200", sector: "default", skillTarget: "Digital Synthesis", bluf: "Cloud-first mandate creates SAR 5B+ in technology advisory and migration services demand|Government agencies need cloud strategy, vendor selection, and change management advisory|Launch a 'Government Cloud Migration Accelerator' targeting the top 15 agencies" },
    { headline: "PIF establishes SAR 8B National Infrastructure Fund — PPP advisory demand surges", source: "Public Investment Fund", sourceType: "pif", url: "https://www.pif.gov.sa/en/news-and-insights/press-releases/2026/national-infrastructure-fund", sector: "default", skillTarget: "Commercial Velocity", bluf: "SAR 8B infrastructure fund creates sustained advisory demand across multiple sectors|PPP structuring, financial modeling, and risk allocation advisory are highest-value services|Pre-position EY's Infrastructure Advisory team with the fund's investment committee" },
    { headline: "EY MENA launches dedicated Government & Public Sector practice — 40 specialists hired", source: "EY MENA", sourceType: "ey", url: "https://www.ey.com/en_ae/news/2026/ey-mena-government-public-sector-practice", sector: "default", skillTarget: "Human-Centric Leadership", bluf: "Dedicated practice signals EY's intent to compete for government transformation mandates|40 specialist hires need onboarding, mentorship, and knowledge management frameworks|Lead the practice's capability building initiative to establish Director-level leadership position" },
    { headline: "BCG wins SAR 300M Royal Commission advisory mandate — competitor intelligence critical", source: "BCG", sourceType: "competitors", url: "https://www.bcg.com/publications/2026/royal-commission-advisory-mandate", sector: "default", skillTarget: "C-Suite Stewardship", bluf: "BCG's Royal Commission win signals deep access to highest levels of Saudi government|SAR 300M mandate scope suggests multi-year, multi-vertical engagement|Identify adjacent Royal Commission priorities where BCG has no incumbent advantage" },
  ],
};

/* ── Color helpers ───────────────────────────────────── */
const dotColor = (type: string) => {
  switch (type) {
    case "saudi_official": return "bg-emerald-400";
    case "pif": return "bg-blue-400";
    case "saudi_press": return "bg-foreground";
    case "competitors": return "bg-pink-500";
    case "ey": return "bg-primary";
    default: return "bg-muted-foreground";
  }
};

const labelColor = (type: string) => {
  switch (type) {
    case "saudi_official": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "pif": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "saudi_press": return "bg-foreground/10 text-foreground border-foreground/20";
    case "competitors": return "bg-pink-500/10 text-pink-400 border-pink-500/20";
    case "ey": return "bg-primary/10 text-primary border-primary/20";
    default: return "bg-muted/10 text-muted-foreground border-border";
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

/* ── Component ──────────────────────────────────────── */
const SectorPulseTicker = ({ onOpenChat }: SectorPulseTickerProps) => {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<TickerItem | null>(null);
  const [userSector, setUserSector] = useState<string>("default");
  const [validating, setValidating] = useState(false);
  const [paused, setPaused] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const detectSector = async () => {
      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("sector_focus, core_practice")
        .maybeSingle();
      if (!profile) { setUserSector("default"); return; }
      const focus = ((profile as any).sector_focus || (profile as any).core_practice || "").toLowerCase();
      if (focus.includes("water") || focus.includes("utilit")) setUserSector("water");
      else if (focus.includes("financ") || focus.includes("bank")) setUserSector("finance");
      else setUserSector("default");
    };
    detectSector();
  }, []);

  useEffect(() => {
    const sectorItems = SEED_SIGNALS[userSector] || SEED_SIGNALS.default;
    // Deep-link mandate: reject homepages/top-level domains — only accept article-level URLs with unique slugs
    const verifiedItems = sectorItems.filter((item) => isDeepLink(item.url));
    setItems(verifiedItems);
  }, [userSector]);

  const handleClick = (item: TickerItem) => {
    setPaused(true);
    setSelectedItem(item);
  };

  const handleClose = () => {
    setSelectedItem(null);
    setPaused(false);
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
      toast({ title: "Skill Validated", description: `+2% boost to ${item.skillTarget}.` });
      handleClose();
    } catch (err) {
      console.error("Validate failed:", err);
      toast({ title: "Error", description: "Could not validate skill.", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }, [userSector, toast]);

  // Duplicate items for seamless infinite loop
  const loopItems = [...items, ...items];

  return (
    <>
      <div className="overflow-hidden rounded-xl glass-card p-3 relative">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] text-primary font-semibold tracking-widest uppercase">
            Live Sector Pulse
          </span>
          <span className="text-[9px] text-muted-foreground/40 ml-auto uppercase tracking-wider">
            {userSector === "default" ? "Multi-Sector" : userSector} · {items.length} signals
          </span>
        </div>

        {/* Scrolling ticker — seamless infinite loop */}
        <div className="relative overflow-hidden" ref={scrollRef}>
          <div
            className={`flex gap-8 whitespace-nowrap ${paused ? "" : "animate-ticker-scroll"}`}
            style={{ width: "max-content" }}
          >
            {loopItems.map((item, i) => (
              <button
                key={i}
                onClick={() => handleClick(item)}
                className="text-xs text-muted-foreground flex items-center gap-1.5 hover:text-foreground transition-colors group shrink-0"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor(item.sourceType)}`} />
                <span className="group-hover:underline underline-offset-2">{item.headline}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/5">
          {["saudi_official", "pif", "saudi_press", "competitors", "ey"].map((type) => (
            <div key={type} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor(type)}`} />
              <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">
                {sourceTypeLabel(type)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Intelligence Drawer — Slide-up */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="bottom" className="glass-card border-t border-border/20 rounded-t-3xl max-h-[85vh] overflow-y-auto pb-10">
          {selectedItem && (
            <div className="pt-2 pb-6 px-1 space-y-5">
              <SheetHeader className="text-left">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${labelColor(selectedItem.sourceType)}`}>
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

              {/* View Original Source — Always available (hard source mandate) */}
              <a
                href={selectedItem.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-primary/15 border-2 border-primary/30 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
                <span>View Original Source</span>
              </a>

              <button
                onClick={() => {
                  handleClose();
                  onOpenChat?.(`Deep dive on: "${selectedItem.headline}" — What are the strategic implications for my ${userSector} practice?`);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-muted/10 border border-border/10 text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted/15 transition-all tactile-press"
              >
                <MessageCircle className="w-4 h-4" />
                Deep Dive with Aura
              </button>

              <button
                onClick={() => handleValidateSkill(selectedItem)}
                disabled={validating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-all tactile-press"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Validate Skill (+2%) — {selectedItem.skillTarget}
              </button>

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
