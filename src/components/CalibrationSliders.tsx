import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

export interface CalibrationDimension {
  id: string;
  name: string;
  description: string;
}

export const CALIBRATION_DIMENSIONS: CalibrationDimension[] = [
  { id: "strategic_architecture", name: "Strategic Thinking", description: "How well do you think in systems and turn strategy into execution?" },
  { id: "sector_foresight", name: "Industry Vision", description: "How clearly do you see where your industry is heading?" },
  { id: "digital_synthesis", name: "Digital Strategy", description: "How naturally do you connect technology to business outcomes?" },
  { id: "csuite_stewardship", name: "Executive Leadership", description: "When you speak to a CEO, do they listen because of your insight?" },
  { id: "executive_presence", name: "Professional Presence", description: "In a room of senior leaders, does your perspective shift the conversation?" },
  { id: "geopolitical_fluency", name: "Regional Awareness", description: "How well do you read the forces shaping your market — policy, regulation, regional shifts?" },
  { id: "human_centric_leadership", name: "People Leadership", description: "Do your teams follow you because they want to — not because they have to?" },
  { id: "operational_resilience", name: "Operational Strength", description: "When things break, does your system hold steady?" },
  { id: "commercial_velocity", name: "Business Impact", description: "How quickly can you turn an idea into measurable revenue?" },
  { id: "value_based_pnl", name: "Financial Acumen", description: "Can you prove the value of your work in numbers a CFO would respect?" },
];

function insightFor(score: number, sector?: string | null): string {
  const s = sector?.trim();
  if (score >= 80) return s
    ? `Exceptional. In ${s}, this is partner-track capability. Your content should reflect this depth.`
    : `Exceptional. This puts you ahead of most senior leaders in any sector.`;
  if (score >= 60) return s
    ? `Strong. In ${s}, this is what separates the leaders who get board invites from those who don't.`
    : `Strong. This is the range where visibility starts compounding.`;
  if (score >= 40) return s
    ? `Solid foundation. Most transformation leaders in ${s} are here. The gap above is where visibility compounds.`
    : `Solid foundation. Most professionals are here — the ones who move up do it intentionally.`;
  if (score >= 20) return s
    ? `Honest answer. This is the dimension most leaders in ${s} avoid talking about — but the ones who close it, move fastest.`
    : `Honest answer. Knowing this is a strength most professionals never develop.`;
  return `Starting here is a strength, not a weakness. Knowing your starting line is how leaders outpace everyone else.`;
}

function percentileFor(avg: number): string {
  if (avg >= 70) return "top 10%";
  if (avg >= 60) return "top 15%";
  if (avg >= 50) return "top 25%";
  if (avg >= 40) return "top 35%";
  if (avg >= 30) return "top 50%";
  return "a unique profile";
}

const BRONZE = "#B08D3A";
const TRACK = "#333";

interface CustomSliderProps {
  value: number;
  onChange: (v: number) => void;
  onChangeEnd?: (v: number) => void;
}

const CustomSlider = ({ value, onChange, onChangeEnd }: CustomSliderProps) => {
  const [dragging, setDragging] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%", padding: "20px 0" }}>
      {/* Track */}
      <div style={{ position: "relative", height: 4, borderRadius: 999, background: TRACK }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${value}%`, background: BRONZE, borderRadius: 999,
        }} />
        {/* Thumb */}
        <div
          style={{
            position: "absolute",
            left: `${value}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 20, height: 20, borderRadius: "50%",
            background: BRONZE,
            boxShadow: dragging ? "0 2px 12px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.3)",
            transition: "box-shadow 150ms ease-out",
            pointerEvents: "none",
          }}
        />
      </div>
      {/* Native input for accessibility + touch */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => { setDragging(false); onChangeEnd?.(value); }}
        onMouseUp={() => onChangeEnd?.(value)}
        onTouchEnd={() => onChangeEnd?.(value)}
        onKeyUp={() => onChangeEnd?.(value)}
        aria-label="Score"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: 44,
          margin: "auto 0",
          opacity: 0,
          cursor: "pointer",
        }}
      />
    </div>
  );
};

interface Props {
  sector?: string | null;
  onComplete: (scores: Record<string, number>) => void | Promise<void>;
  initialScores?: Record<string, number> | null;
  onAutoSave?: (scores: Record<string, number>) => void;
}

export const CalibrationSliders = ({ sector, onComplete, initialScores, onAutoSave }: Props) => {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0); // 0..9 dimensions, 10 = summary
  const [direction, setDirection] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    CALIBRATION_DIMENSIONS.forEach((d) => {
      init[d.id] = (initialScores && typeof initialScores[d.id] === "number")
        ? initialScores[d.id]
        : 50;
    });
    return init;
  });
  const [insight, setInsight] = useState<string>("");
  const [insightVisible, setInsightVisible] = useState(false);
  const [companionLine, setCompanionLine] = useState<string>("");
  const [pulseKey, setPulseKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const lastDecadeRef = useRef<number>(5);

  const isSummary = index === CALIBRATION_DIMENSIONS.length;
  const current = !isSummary ? CALIBRATION_DIMENSIONS[index] : null;
  const currentScore = current ? scores[current.id] : 0;

  // Insight debounce + decade pulse on slider movement
  useEffect(() => {
    if (!current) return;
    setInsightVisible(false);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setInsight(insightFor(currentScore, sector));
      setInsightVisible(true);
    }, 500);
    const decade = Math.floor(currentScore / 10);
    if (decade !== lastDecadeRef.current) {
      lastDecadeRef.current = decade;
      setPulseKey((k) => k + 1);
    }
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [currentScore, current, sector]);

  // Reset insight when navigating to a new dimension
  useEffect(() => {
    if (!current) return;
    setInsightVisible(false);
    setInsight(insightFor(scores[current.id], sector));
    const t = window.setTimeout(() => setInsightVisible(true), 250);
    lastDecadeRef.current = Math.floor(scores[current.id] / 10);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const next = () => {
    if (current) {
      // Persist partial scores so progress isn't lost if the user closes the tab.
      try { onAutoSave?.(scores); } catch { /* non-blocking */ }
      // Companion voice checkpoints (after card 3, 5, 8)
      const justFinished = index + 1; // 1-indexed
      let line = "";
      if (justFinished === 3) line = "You're doing great. 7 more — they go fast. ✦";
      else if (justFinished === 5) {
        const lows = Object.values(scores).filter((v) => v < 40).length;
        line = lows >= 3
          ? "Knowing exactly where you stand is the starting line. Most professionals never get this honest with themselves."
          : "Halfway there. Your strengths are shaping everything.";
      } else if (justFinished === 8) line = "Almost done. These last two shape your commercial edge.";
      if (line) {
        setCompanionLine(line);
        window.setTimeout(() => setCompanionLine(""), 4000);
      }
    }
    setDirection(1);
    setIndex((i) => Math.min(i + 1, CALIBRATION_DIMENSIONS.length));
  };
  const back = () => {
    setDirection(-1);
    setIndex((i) => Math.max(0, i - 1));
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try { await onComplete(scores); } finally { setSubmitting(false); }
  };

  // Summary computations
  const summary = useMemo(() => {
    const sorted = [...CALIBRATION_DIMENSIONS].sort((a, b) => scores[b.id] - scores[a.id]);
    const top2 = sorted.slice(0, 2);
    const lowest = sorted[sorted.length - 1];
    const avg = Object.values(scores).reduce((a, b) => a + b, 0) / CALIBRATION_DIMENSIONS.length;
    return { top2, lowest, percentile: percentileFor(avg) };
  }, [scores]);

  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: direction * 80 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction * -80 },
      };

  return (
    <div>
      {/* Progress dots: 5 onboarding dots, step 3 active */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 999,
            background: i === 2 ? BRONZE : i < 2 ? "hsl(142 60% 45%)" : "transparent",
            border: i > 2 ? "1px solid hsl(var(--border))" : "none",
          }} />
        ))}
      </div>
      <p style={{
        fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
        color: BRONZE, textAlign: "center", marginBottom: 24, fontWeight: 600,
      }}>
        Step 3 of 5 — Map your strengths
      </p>

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        {!isSummary && current ? (
          <motion.div
            key={`dim-${index}`}
            {...slide}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                {index + 1} of {CALIBRATION_DIMENSIONS.length}
              </span>
            </div>
            <motion.h2
              initial={reduceMotion ? false : { x: direction * 10 }}
              animate={{ x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{
                fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
                fontSize: 22, color: BRONZE, marginBottom: 10, lineHeight: 1.3,
              }}
            >
              {current.name}
            </motion.h2>
            <p style={{
              fontSize: 15, lineHeight: 1.5, color: "hsl(var(--muted-foreground))",
              maxWidth: 360, marginBottom: 24,
            }}>
              {current.description}
            </p>

            <CustomSlider
              value={currentScore}
              onChange={(v) => setScores((s) => ({ ...s, [current.id]: v }))}
            />

            <motion.div
              key={pulseKey}
              initial={{ scale: 1 }}
              animate={{ scale: reduceMotion ? 1 : [1, 1.05, 1] }}
              transition={{ duration: 0.2 }}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 36, color: BRONZE, fontWeight: 600,
                textAlign: "center", margin: "8px 0 18px",
              }}
            >
              {currentScore}
            </motion.div>

            <div style={{ minHeight: 60, maxWidth: 380, margin: "0 auto 24px" }}>
              <motion.p
                animate={{ opacity: insightVisible ? 1 : 0 }}
                transition={{ duration: insightVisible ? 0.4 : 0.2 }}
                style={{
                  fontSize: 14, lineHeight: 1.55, color: "hsl(var(--muted-foreground))",
                  textAlign: "center",
                }}
              >
                {insight}
              </motion.p>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              {index > 0 ? (
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: "hsl(var(--muted-foreground))", background: "transparent", padding: "10px 8px" }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              ) : <span />}
              <button
                onClick={next}
                className="font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  height: 44, padding: "0 22px", minWidth: 140,
                  background: BRONZE, color: "#1A1916",
                  borderRadius: 10, fontSize: 14,
                }}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="summary"
            {...slide}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <SummaryCard
              summary={summary}
              scores={scores}
              submitting={submitting}
              onFinish={handleFinish}
              onBack={back}
              reduceMotion={!!reduceMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Companion voice */}
      <div style={{ minHeight: 28, marginTop: 16, textAlign: "center" }}>
        <AnimatePresence>
          {companionLine && (
            <motion.p
              key={companionLine}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}
            >
              {companionLine}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

interface SummaryCardProps {
  summary: { top2: CalibrationDimension[]; lowest: CalibrationDimension; percentile: string };
  scores: Record<string, number>;
  submitting: boolean;
  reduceMotion: boolean;
  onFinish: () => void;
  onBack: () => void;
}

const CountUp = ({ value, reduceMotion, onDone }: { value: number; reduceMotion: boolean; onDone?: () => void }) => {
  const [n, setN] = useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (reduceMotion) { setN(value); onDone?.(); return; }
    const duration = 800;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{n}</>;
};

const SummaryCard = ({ summary, scores, submitting, reduceMotion, onFinish, onBack }: SummaryCardProps) => {
  const [numbersDone, setNumbersDone] = useState(0);
  const totalNumbers = 3;
  const showPercentile = numbersDone >= totalNumbers;
  const [companion, setCompanion] = useState("");
  useEffect(() => {
    if (showPercentile) {
      const t = window.setTimeout(() => setCompanion("This is rare. Most professionals never map their strengths like this."), 600);
      return () => window.clearTimeout(t);
    }
  }, [showPercentile]);
  const onNumDone = () => setNumbersDone((n) => n + 1);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, color: BRONZE, marginBottom: 12 }}>✦</div>
      <h2 style={{
        fontFamily: "var(--font-display, 'Cormorant Garamond', serif)",
        fontSize: 22, color: "hsl(var(--foreground))", marginBottom: 24,
      }}>
        Your Calibration
      </h2>

      <div style={{ textAlign: "left", maxWidth: 360, margin: "0 auto 20px" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 8 }}>
          Strongest edges
        </p>
        {summary.top2.map((d) => (
          <p key={d.id} style={{ fontSize: 14, color: "hsl(var(--foreground))", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: BRONZE }}>◆</span>
            <span>{d.name}</span>
            <span style={{
              marginLeft: "auto", color: BRONZE, fontFamily: "'JetBrains Mono', monospace",
              boxShadow: numbersDone >= totalNumbers ? "0 0 8px rgba(176,141,58,0.3)" : "none",
              borderRadius: 4, padding: "0 4px", transition: "box-shadow 400ms ease",
            }}>
              <CountUp value={scores[d.id]} reduceMotion={reduceMotion} onDone={onNumDone} />
            </span>
          </p>
        ))}

        <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", margin: "18px 0 8px" }}>
          Biggest growth territory
        </p>
        <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span>◇</span>
          <span>{summary.lowest.name}</span>
          <span style={{
            marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace",
            color: "hsl(var(--muted-foreground))",
          }}>
            <CountUp value={scores[summary.lowest.id]} reduceMotion={reduceMotion} onDone={onNumDone} />
          </span>
        </p>
      </div>

      <motion.p
        animate={{ opacity: showPercentile ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 12 }}
      >
        Your calibration places you in the {summary.percentile} of professionals who've completed this assessment.
      </motion.p>

      <AnimatePresence>
        {companion && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginBottom: 20, fontStyle: "italic" }}
          >
            {companion}
          </motion.p>
        )}
      </AnimatePresence>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "hsl(var(--muted-foreground))", background: "transparent", padding: "10px 8px" }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onFinish}
          disabled={submitting}
          className="font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          style={{
            height: 44, padding: "0 22px",
            background: BRONZE, color: "#1A1916",
            borderRadius: 10, fontSize: 14,
          }}
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue to step 4 <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default CalibrationSliders;