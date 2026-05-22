import { useEffect, useRef } from "react";
import {
  FileText,
  Link as LinkIcon,
  Mic,
  Edit3,
  Sun,
  BarChart2,
  Zap,
  Target,
  type LucideIcon,
} from "lucide-react";

type Node = {
  Icon: LucideIcon;
  label: string;
  speed: number;
  phase: number;
  rx: number; // ellipse radius x
  ry: number; // ellipse radius y
};

const NODES: Node[] = [
  { Icon: FileText, label: "Document", speed: 0.034, phase: 0, rx: 230, ry: 150 },
  { Icon: LinkIcon, label: "Web Link", speed: 0.040, phase: Math.PI / 4, rx: 260, ry: 170 },
  { Icon: Mic, label: "Voice Note", speed: 0.045, phase: Math.PI / 2, rx: 220, ry: 140 },
  { Icon: Edit3, label: "Notes", speed: 0.036, phase: (3 * Math.PI) / 4, rx: 250, ry: 160 },
  { Icon: Sun, label: "Insight", speed: 0.032, phase: Math.PI, rx: 240, ry: 155 },
  { Icon: BarChart2, label: "Analytics", speed: 0.042, phase: (5 * Math.PI) / 4, rx: 270, ry: 175 },
  { Icon: Zap, label: "Signal", speed: 0.038, phase: (3 * Math.PI) / 2, rx: 225, ry: 145 },
  { Icon: Target, label: "Strategy", speed: 0.044, phase: (7 * Math.PI) / 4, rx: 255, ry: 165 },
];

export default function HeroHead() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  // mouse normalized [-1, 1]
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const startTime = useRef<number>(performance.now());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMove = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const nx = ((clientX - r.left) / r.width) * 2 - 1;
      const ny = ((clientY - r.top) / r.height) * 2 - 1;
      target.current.x = Math.max(-1, Math.min(1, nx));
      target.current.y = Math.max(-1, Math.min(1, ny));
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) handleMove(t.clientX, t.clientY);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    const tick = () => {
      // interpolate at 2.5% per frame
      current.current.x += (target.current.x - current.current.x) * 0.025;
      current.current.y += (target.current.y - current.current.y) * 0.025;

      const rotY = current.current.x * 22;
      const rotX = -current.current.y * 7;

      if (headRef.current) {
        headRef.current.style.transform = `rotateY(${rotY}deg) rotateX(${rotX}deg)`;
      }

      const t = (performance.now() - startTime.current) / 1000;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;

      NODES.forEach((node, i) => {
        const ref = nodeRefs.current[i];
        if (!ref) return;
        const angle = node.phase + t * node.speed * (2 * Math.PI);
        const x = Math.cos(angle) * node.rx;
        const y = Math.sin(angle) * node.ry;
        // depth: sin of angle, front = positive
        const depth = Math.sin(angle);
        const scale = 0.75 + (depth + 1) * 0.2; // 0.75..1.15
        const opacity = 0.45 + (depth + 1) * 0.27; // 0.45..0.99
        const parallaxX = current.current.x * 18;
        const parallaxY = current.current.y * 12;
        const px = cx + x + parallaxX - 28;
        const py = cy + y + parallaxY - 28;
        ref.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${scale})`;
        ref.style.opacity = String(opacity);
        ref.style.zIndex = depth > 0 ? "30" : "10";
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center overflow-hidden select-none"
      style={{
        width: "100vw",
        height: "70vh",
        minHeight: "500px",
        perspective: "1200px",
        transformStyle: "preserve-3d",
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes hero-scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(70vh); }
        }
        @keyframes hero-eye-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
        .hero-scan-line {
          position: absolute; left: 0; right: 0; top: 0; height: 1px;
          background: rgba(212,176,86,0.09);
          animation: hero-scan 7s linear infinite;
          pointer-events: none;
        }
      `}</style>

      <div className="hero-scan-line" />

      {/* Head */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: "translate(-50%, -50%)",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          ref={headRef}
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.05s linear",
            willChange: "transform",
          }}
          className="relative"
        >
          <img
            src="/hero-head.png"
            alt=""
            className="block h-auto mx-auto"
            style={{
              width: "min(600px, 85vw)",
              filter:
                "saturate(0.3) sepia(0.85) hue-rotate(-10deg) brightness(1.1) contrast(1.1) drop-shadow(0 0 50px rgba(176,141,58,0.12))",
              background: "transparent",
              border: "3px solid red",
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Orbiting nodes */}
      {NODES.map((node, i) => {
        const Icon = node.Icon;
        return (
          <div
            key={node.label}
            ref={(el) => (nodeRefs.current[i] = el)}
            className="absolute top-0 left-0 flex flex-col items-center gap-1 pointer-events-none"
            style={{ width: 56, willChange: "transform, opacity" }}
          >
            <div
              className="bg-background/40 flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(176,141,58,0.18)",
                boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
              }}
            >
              <Icon
                size={26}
                stroke="#d4b056"
                strokeWidth={1.5}
                fill="none"
              />
            </div>
            <span
              className="text-muted-foreground uppercase tracking-wider"
              style={{ fontSize: 9, lineHeight: 1.2 }}
            >
              {node.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}