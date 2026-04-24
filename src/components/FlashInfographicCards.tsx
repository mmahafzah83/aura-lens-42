import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Download, RefreshCw, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlashInfographicCardsProps {
  postText: string;
  lang: "ar" | "en";
  topic: string;
  sector: string;
  postType: string;
  authorName: string;
  authorRole: string;
}

function detectStyles(postText: string, postType: string): string[] {
  const has_comparison = /الواقع|الخيال|مقابل|بالعكس|قبل|بعد|reality|vs\b|versus|before|after/i.test(postText);
  const has_numbered = (postText.match(/[◆↳•]/g) || []).length >= 3 || /[١٢٣][\.\-]|[1-3]\./i.test(postText);
  const has_stat = /\d+[\%٪]|\d+\s*(مليون|billion|million)/i.test(postText);
  const has_pattern = postType === "نمط" || /نمط|متكرر|دائماً|pattern|always/i.test(postText);

  const styles: string[] = [];
  if (has_comparison) styles.push("comparison");
  if (has_numbered) styles.push("framework");
  if (has_stat) styles.push("stat");
  if (has_pattern) styles.push("pattern");
  styles.push("quote");

  return [...new Set(styles)].slice(0, 3);
}

function extractContent(postText: string) {
  const sentences = postText.split(/[.\n]+/).map(s => s.trim()).filter(s => s.length > 10);
  const headline = sentences[0] || postText.slice(0, 80);
  const points = (postText.match(/[◆•↳]\s*.+/g) || []).slice(0, 4).map(p => p.replace(/^[◆•↳]\s*/, "").trim());
  const finalPoints = points.length > 0 ? points : sentences.slice(1, 5);
  const stat = postText.match(/\d+[\%٪]/)?.[0] || postText.match(/\d{2,}/)?.[0] || "";
  const question = sentences.find(s => s.includes("؟") || s.includes("?")) || sentences[sentences.length - 1] || "";
  return { headline, points: finalPoints, stat, question, sentences };
}

function trunc(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CAIRO = "'Cairo', sans-serif";

function Signature({ authorName, authorRole, lang }: { authorName: string; authorRole: string; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  return (
    <div
      style={{
        backgroundColor: "#111",
        borderTop: "1px solid #252525",
        display: "flex",
        flexDirection: isAr ? "row-reverse" : "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        height: "100%",
      }}
    >
      <div style={{ textAlign: isAr ? "right" : "left", fontFamily: isAr ? CAIRO : "Inter, sans-serif" }}>
        <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{authorName}</div>
        <div style={{ color: "#C5A55A", fontSize: 9, lineHeight: 1.3 }}>{authorRole}</div>
      </div>
      <div style={{ display: "flex", flexDirection: isAr ? "row-reverse" : "row", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#888", fontSize: 9, fontFamily: isAr ? CAIRO : "Inter, sans-serif" }}>
          {isAr ? "تابعني على LinkedIn" : "Follow me on LinkedIn"}
        </span>
        <Linkedin size={11} color="#0077B5" fill="#0077B5" />
      </div>
    </div>
  );
}

function ComparisonCard({ data, sector, authorName, authorRole, lang, cardRef }: any) {
  const { headline, points } = data;
  const realityPts = points.slice(0, 3);
  const goalPts = points.slice(3, 6).length >= 1 ? points.slice(3, 6) : points.slice(0, 3);
  return (
    <div
      ref={cardRef}
      style={{
        width: 300,
        height: 420,
        backgroundColor: "#0d0d0d",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: CAIRO,
        direction: "rtl",
      }}
    >
      {/* TOP */}
      <div style={{ height: "30%", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span
          style={{
            backgroundColor: "#F97316",
            color: "#fff",
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 20,
            alignSelf: "flex-start",
            fontFamily: CAIRO,
          }}
        >
          {sector || (lang === "ar" ? "عام" : "General")}
        </span>
        <div
          dir="rtl"
          style={{ fontSize: 15, fontWeight: 800, color: "#fff", textAlign: "right", lineHeight: 1.5, fontFamily: CAIRO }}
        >
          {trunc(headline, 60)}
        </div>
      </div>

      {/* MIDDLE */}
      <div style={{ height: "55%", display: "flex", flexDirection: "row", padding: "0 12px", gap: 0 }}>
        {/* Reality (left visually, but RTL doesn't matter for numerical positioning here) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#888", textAlign: "center", fontFamily: CAIRO }}>
            {lang === "ar" ? "الواقع" : "Reality"}
          </div>
          {realityPts.slice(0, 3).map((p: string, i: number) => (
            <div key={i} dir="rtl" style={{ display: "flex", flexDirection: "row-reverse", gap: 4, alignItems: "flex-start" }}>
              <span style={{ color: "#E24B4A", fontSize: 11, flexShrink: 0 }}>✗</span>
              <span style={{ color: "#ccc", fontSize: 11, textAlign: "right", lineHeight: 1.4, fontFamily: CAIRO }}>
                {trunc(p, 40)}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ position: "relative", margin: "0 8px", width: 1, backgroundColor: "#F97316" }}>
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#F97316",
              fontSize: 16,
              backgroundColor: "#0d0d0d",
              padding: "0 2px",
            }}
          >
            ←
          </span>
        </div>

        {/* Goal */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#C5A55A", textAlign: "center", fontFamily: CAIRO }}>
            {lang === "ar" ? "المأمول" : "Goal"}
          </div>
          {goalPts.slice(0, 3).map((p: string, i: number) => (
            <div key={i} dir="rtl" style={{ display: "flex", flexDirection: "row-reverse", gap: 4, alignItems: "flex-start" }}>
              <span style={{ color: "#7ab648", fontSize: 11, flexShrink: 0 }}>✓</span>
              <span style={{ color: "#e0e0e0", fontSize: 11, textAlign: "right", lineHeight: 1.4, fontFamily: CAIRO }}>
                {trunc(p, 40)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SIGNATURE */}
      <div style={{ height: "15%" }}>
        <Signature authorName={authorName} authorRole={authorRole} lang={lang} />
      </div>
    </div>
  );
}

function FrameworkCard({ data, authorName, authorRole, lang, cardRef }: any) {
  const { headline, points, sentences } = data;
  const insight = sentences[sentences.length - 1] || "";
  return (
    <div
      ref={cardRef}
      style={{
        width: 300,
        height: 420,
        backgroundColor: "#0d0d0d",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: CAIRO,
        direction: "rtl",
        borderRight: "3px solid #F97316",
      }}
    >
      {/* TOP */}
      <div style={{ height: "25%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 3, backgroundColor: "#F97316", width: "100%" }} />
        <div
          dir="rtl"
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#fff",
            textAlign: "right",
            padding: "10px 12px",
            lineHeight: 1.5,
            fontFamily: CAIRO,
            flex: 1,
          }}
        >
          {trunc(headline, 65)}
        </div>
      </div>

      {/* MIDDLE */}
      <div style={{ height: "60%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {points.slice(0, 3).map((p: string, i: number) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "row-reverse",
              alignItems: "flex-start",
              padding: "8px 12px",
              borderBottom: "1px solid #1a1a1a",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: "#F97316",
                color: "#fff",
                fontSize: 12,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div
              dir="rtl"
              style={{
                color: "#e0e0e0",
                fontSize: 11,
                textAlign: "right",
                lineHeight: 1.6,
                flex: 1,
                fontFamily: CAIRO,
              }}
            >
              {trunc(p, 90)}
            </div>
          </div>
        ))}
        {insight && (
          <div
            dir="rtl"
            style={{
              color: "#C5A55A",
              fontSize: 10,
              textAlign: "right",
              padding: "8px 12px",
              fontStyle: "italic",
              fontFamily: CAIRO,
            }}
          >
            {trunc(insight, 80)}
          </div>
        )}
      </div>

      {/* SIGNATURE */}
      <div style={{ height: "15%" }}>
        <Signature authorName={authorName} authorRole={authorRole} lang={lang} />
      </div>
    </div>
  );
}

function QuoteCard({ data, sector, authorName, authorRole, lang, cardRef }: any) {
  const { headline, question } = data;
  return (
    <div
      ref={cardRef}
      style={{
        width: 300,
        height: 420,
        background: "linear-gradient(135deg, #0d0d0d 0%, #1a1008 100%)",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: CAIRO,
        direction: "rtl",
        position: "relative",
      }}
    >
      {/* TOP */}
      <div style={{ height: "15%", padding: "12px", position: "relative" }}>
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 12,
            fontSize: 48,
            color: "#F97316",
            opacity: 0.6,
            fontFamily: CAIRO,
            lineHeight: 1,
          }}
        >
          «
        </span>
        <span
          style={{
            backgroundColor: "#F97316",
            color: "#fff",
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 20,
            display: "inline-block",
            fontFamily: CAIRO,
          }}
        >
          {sector || (lang === "ar" ? "عام" : "General")}
        </span>
      </div>

      {/* MIDDLE */}
      <div style={{ height: "65%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          dir="rtl"
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#fff",
            textAlign: "right",
            lineHeight: 1.7,
            padding: "12px 16px",
            fontFamily: CAIRO,
          }}
        >
          {trunc(headline, 100)}
        </div>
        <div style={{ height: 2, width: 40, backgroundColor: "#F97316", alignSelf: "flex-end", marginRight: 16 }} />
        {question && (
          <div
            dir="rtl"
            style={{
              fontSize: 12,
              color: "#C5A55A",
              textAlign: "right",
              padding: "8px 16px",
              fontStyle: "italic",
              fontFamily: CAIRO,
              lineHeight: 1.5,
            }}
          >
            {trunc(question, 80)}
          </div>
        )}
      </div>

      {/* SIGNATURE */}
      <div style={{ height: "20%" }}>
        <Signature authorName={authorName} authorRole={authorRole} lang={lang} />
      </div>
    </div>
  );
}

function PatternCard({ data, authorName, authorRole, lang, cardRef }: any) {
  const { headline, points, sentences } = data;
  const labels = points.slice(0, 3).map((p: string) => trunc(p.split(/\s+/).slice(0, 3).join(" "), 14));
  while (labels.length < 3) labels.push("…");
  const context = sentences[1] || sentences[0] || "";

  // Compute 3 node positions on a circle of r=80, centered at (90,90)
  const cx = 90, cy = 90, r = 80;
  const nodes = [0, 1, 2].map(i => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), label: labels[i] };
  });

  return (
    <div
      ref={cardRef}
      style={{
        width: 300,
        height: 420,
        backgroundColor: "#0d0d0d",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: CAIRO,
        direction: "rtl",
      }}
    >
      <div style={{ height: "20%", padding: 12 }}>
        <div
          dir="rtl"
          style={{ fontSize: 14, fontWeight: 800, color: "#fff", textAlign: "right", fontFamily: CAIRO, lineHeight: 1.5 }}
        >
          {trunc(headline, 60)}
        </div>
      </div>

      <div style={{ height: "55%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={180} height={180} viewBox="0 0 180 180">
          <circle cx={cx} cy={cy} r={r} stroke="#F97316" strokeWidth={2} fill="none" opacity={0.4} />
          {nodes.map((n, i) => {
            const next = nodes[(i + 1) % 3];
            const mx = (n.x + next.x) / 2;
            const my = (n.y + next.y) / 2;
            // simple arc between nodes with slight curve
            return (
              <path
                key={`arr-${i}`}
                d={`M ${n.x} ${n.y} Q ${mx} ${my - 8} ${next.x} ${next.y}`}
                stroke="#F97316"
                strokeWidth={1.5}
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="#F97316" />
            </marker>
          </defs>
          {nodes.map((n, i) => (
            <g key={i}>
              <circle cx={n.x} cy={n.y} r={22} fill="#1a1a1a" stroke="#F97316" strokeWidth={1.5} />
              <text
                x={n.x}
                y={n.y + 3}
                textAnchor="middle"
                fill="#fff"
                fontSize={9}
                fontFamily="Cairo, sans-serif"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ height: "10%", padding: "0 12px" }}>
        <div
          dir="rtl"
          style={{ color: "#ccc", fontSize: 10, textAlign: "right", fontFamily: CAIRO, lineHeight: 1.5 }}
        >
          {trunc(context, 70)}
        </div>
      </div>

      <div style={{ height: "15%" }}>
        <Signature authorName={authorName} authorRole={authorRole} lang={lang} />
      </div>
    </div>
  );
}

const STYLE_LABELS_AR: Record<string, string> = {
  comparison: "مقارنة",
  framework: "تفكيك",
  quote: "اقتباس",
  stat: "إحصائية",
  pattern: "نمط",
};
const STYLE_LABELS_EN: Record<string, string> = {
  comparison: "Comparison",
  framework: "Framework",
  quote: "Quote",
  stat: "Stat",
  pattern: "Pattern",
};

export default function FlashInfographicCards({
  postText,
  lang,
  topic,
  sector,
  postType,
  authorName,
  authorRole,
}: FlashInfographicCardsProps) {
  const [seed, setSeed] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Inject Cairo once
  useEffect(() => {
    const id = "cairo-google-font";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const { styles, data } = useMemo(() => {
    const detected = detectStyles(postText, postType);
    const extracted = extractContent(postText);
    const variant = { ...extracted, points: seed % 2 === 1 ? shuffle(extracted.points) : extracted.points };
    return { styles: detected, data: variant };
  }, [postText, postType, seed]);

  const exportCard = async (idx: number, styleName: string) => {
    const el = cardRefs.current[idx];
    if (!el) return;
    try {
      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `flash-${styleName}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
    } catch (e) {
      console.error("export failed", e);
    }
  };

  const renderCard = (style: string, idx: number) => {
    const refSetter = (el: HTMLDivElement | null) => { cardRefs.current[idx] = el; };
    const common = { data, sector, authorName, authorRole, lang, cardRef: refSetter };
    if (style === "comparison") return <ComparisonCard {...common} />;
    if (style === "framework") return <FrameworkCard {...common} />;
    if (style === "pattern") return <PatternCard {...common} />;
    return <QuoteCard {...common} />;
  };

  const labelFor = (s: string) => (lang === "ar" ? STYLE_LABELS_AR[s] || s : STYLE_LABELS_EN[s] || s);
  const isAr = lang === "ar";
  const cairoStyle = { fontFamily: CAIRO };

  return (
    <div className="space-y-3 pt-3 border-t border-border/10">
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
        {styles.map((s, idx) => {
          const isSelected = selected === idx;
          return (
            <div key={`${s}-${idx}`} className="flex-shrink-0 flex flex-col items-center gap-2">
              <div
                onClick={() => setSelected(idx)}
                style={{
                  border: isSelected ? "2px solid #F97316" : "2px solid transparent",
                  borderRadius: 14,
                  padding: 2,
                  boxShadow: isSelected ? "0 0 0 3px rgba(249,115,22,0.3)" : "none",
                  opacity: selected !== null && !isSelected ? 0.6 : 1,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {renderCard(s, idx)}
              </div>
              <div style={{ color: "#888", fontSize: 12, textAlign: "center", ...(isAr ? cairoStyle : {}) }}>
                {labelFor(s)}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSelected(idx)}>
                  <span style={isAr ? cairoStyle : undefined}>{isAr ? "اختر هذا" : "Select this"}</span>
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => exportCard(idx, s)} aria-label="Download">
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setSeed(s => s + 1)}>
          <RefreshCw className="w-3 h-3" />
          <span style={isAr ? cairoStyle : undefined}>{isAr ? "🔄 أعد التوليد" : "🔄 Regenerate"}</span>
        </Button>
      </div>
      <p
        className="text-[11px] text-center"
        style={{ color: "#555", marginTop: 4, ...(isAr ? cairoStyle : {}) }}
      >
        {isAr ? "الصور تُولَّد من المحتوى مباشرة — بدون AI" : "Cards generated directly from content — no AI"}
      </p>
    </div>
  );
}