import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "aura_visited_pages";

type PageKey = "home" | "intelligence" | "publish" | "impact" | "story";

type HintAction = { label: string; eventName: string };

const HINTS: Record<PageKey, { desc: string; action?: HintAction }> = {
  home: {
    desc: "Your intelligence command center. Start by capturing something you read today — that's how the system learns what matters to you.",
    action: { label: "Capture now →", eventName: "aura:open-capture" },
  },
  story: {
    desc: "This is how the market sees you. Right now it's based on your assessment — the more you capture and publish, the more evidence-backed this portrait becomes.",
  },
  intelligence: {
    desc: "Signals appear here as you capture. You won't see much yet — that's normal. After 5–10 captures, patterns start emerging, and each one becomes a publishing opportunity.",
    action: { label: "Capture your first source →", eventName: "aura:open-capture" },
  },
  publish: {
    desc: "Create content from your signals — try Flash mode for 3 Arabic or English post variations in 60 seconds.",
    action: { label: "Try Flash mode →", eventName: "aura:open-flash" },
  },
  impact: {
    desc: "Your authority trajectory starts here. The score updates as you capture, build signals, and publish — upload your LinkedIn analytics to see the full picture.",
    action: { label: "Upload LinkedIn data →", eventName: "aura:scroll-linkedin-upload" },
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

/**
 * FirstVisitHint
 *
 * Props:
 *  - page: which page hint to render
 *  - suppress: when true, the hint is unconditionally hidden AND will not be
 *    marked as "visited". This lets a parent gate the hint behind another
 *    onboarding element (e.g. the welcome card) without permanently
 *    consuming the hint. Critical for the regression: welcome card and
 *    first-visit hint MUST NEVER appear at the same time.
 */
export default function FirstVisitHint({
  page,
  suppress = false,
}: {
  page: PageKey;
  suppress?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (suppress) {
      setShow(false);
      return;
    }
    if (!getVisited().includes(page)) setShow(true);
  }, [page, suppress]);

  // Regression guard (dev only): if a sibling welcome card is mounted while
  // this hint is also visible, log a loud warning so we catch any future
  // logic that re-introduces the overlap bug.
  useEffect(() => {
    if (!show || typeof document === "undefined") return;
    const welcome = document.querySelector('[data-onboarding="welcome-card"]');
    if (welcome && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(
        "[FirstVisitHint] Regression: welcome card and first-visit hint are both visible. Pass `suppress` while welcome is shown."
      );
    }
  }, [show]);

  if (suppress || !show) return null;
  const h = HINTS[page];

  const dismiss = () => {
    setLeaving(true);
    markVisited(page);
    window.setTimeout(() => setShow(false), 300);
  };

  return (
    <div
      style={{
        background: "var(--paper-2)",
        borderLeft: "3px solid var(--brand)",
        borderRadius: 8,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        padding: "12px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 16,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(-6px)" : "translateY(0)",
        transition: "opacity 300ms, transform 300ms",
      }}
      role="note"
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.55 }}>
          {h.desc}
        </div>
        {h.action && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(h.action!.eventName));
              dismiss();
            }}
            style={{
              marginTop: 8,
              background: "transparent", border: 0, padding: 0,
              fontSize: 12, color: "var(--bronze-glow, var(--brand))", fontWeight: 700,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              cursor: "pointer",
            }}
          >
            {h.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss hint"
        style={{
          background: "transparent", border: 0, padding: 4,
          color: "var(--ink-3)", cursor: "pointer", flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
