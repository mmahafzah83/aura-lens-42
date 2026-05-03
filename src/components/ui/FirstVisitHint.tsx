import { useEffect, useState } from "react";

const STORAGE_KEY = "aura_visited_pages";

type PageKey = "home" | "intelligence" | "publish" | "impact" | "story";

const HINTS: Record<PageKey, { icon: string; title: string; desc: string }> = {
  home: {
    icon: "🏠",
    title: "Your command center",
    desc: "Aura shows your most important action at the top. A competitor alert means someone published on your topic — respond fast. Recommended moves are your daily to-do list.",
  },
  intelligence: {
    icon: "📡",
    title: "Your strategic radar",
    desc: "Every article you capture feeds the signal engine. Higher confidence = deeper expertise. Click any signal to see what's behind it. 3+ captures unlock your first signal.",
  },
  publish: {
    icon: "✦",
    title: "Your content engine",
    desc: "Pick a post angle from the sidebar — these come from your strongest signals. Click Generate, choose EN or Arabic, then refine. The quality score shows how LinkedIn-ready your post is.",
  },
  impact: {
    icon: "📈",
    title: "Your authority trajectory",
    desc: "Your score combines signals (40%), published content (40%), and capture rhythm (20%). The journey bar shows your tier. The trajectory chart shows where you're heading.",
  },
  story: {
    icon: "🎯",
    title: "Your market position",
    desc: "This is how the professional market sees you. Signal coverage shows your expertise depth. Your archetype and authority statement are generated from your real signals — share them.",
  },
};

function getVisited(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markVisited(page: string) {
  try {
    const v = getVisited();
    if (!v.includes(page)) {
      v.push(page);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    }
  } catch {
    /* ignore */
  }
}

export default function FirstVisitHint({ page }: { page: PageKey }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!getVisited().includes(page)) setShow(true);
  }, [page]);

  if (!show) return null;
  const h = HINTS[page];

  const dismiss = () => {
    setLeaving(true);
    markVisited(page);
    window.setTimeout(() => setShow(false), 300);
  };

  return (
    <div
      style={{
        background: "var(--brand-ghost)",
        borderLeft: "3px solid var(--brand)",
        borderRadius: 10,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        marginBottom: 16,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(-6px)" : "translateY(0)",
        transition: "opacity 300ms, transform 300ms",
      }}
      role="note"
    >
      <span
        aria-hidden
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "rgba(176,141,58,0.10)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0,
        }}
      >
        {h.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>
          {h.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6, marginTop: 4 }}>
          {h.desc}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: "transparent", border: 0, padding: "2px 6px",
          fontSize: 12, color: "var(--brand)", fontWeight: 600,
          cursor: "pointer", flexShrink: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
}
