import { useState, useEffect, useMemo } from "react";
import { useGuideArticles } from "@/hooks/useGuideArticles";
import { recordGuideMiss } from "@/lib/recordGuideMiss";

interface FirstTimeHintProps {
  hintKey: string;
  children: string;
}

export function FirstTimeHint({ hintKey, children }: FirstTimeHintProps) {
  const storageKey = `aura_hint_${hintKey}`;
  const [visible, setVisible] = useState(false);
  const { articles, loading } = useGuideArticles();

  const corpusText = useMemo(
    () => articles.find(a => a.slug === hintKey)?.answer_en,
    [articles, hintKey]
  );

  useEffect(() => {
    if (loading) return;
    if (!articles || articles.length === 0) return;
    if (!articles.some(a => a.slug === hintKey)) {
      recordGuideMiss(hintKey, "hint");
    }
  }, [loading, articles, hintKey]);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setVisible(true);
    } catch {
      // localStorage blocked — don't show hints
    }
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(storageKey, "1"); } catch {}
  };

  const displayText = (!loading && corpusText) ? corpusText : children;

  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        marginBottom: 14,
        borderRadius: 8,
        background: "color-mix(in srgb, var(--spot) 6%, transparent)",
        border: "0.5px solid color-mix(in srgb, var(--spot) 25%, transparent)",
        animation: "hintFadeIn 240ms ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
        <span aria-hidden style={{ color: "var(--spot-2)", fontSize: 13, lineHeight: "20px", flexShrink: 0 }}>✦</span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: "hsl(var(--foreground))" }}>{displayText}</span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="v23-tap v23-focus v23-pressable"
        style={{
          background: "var(--paper-2)",
          color: "var(--ink)",
          fontSize: 12,
          fontWeight: 500,
          padding: "6px 14px",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        Got it
      </button>
    </div>
  );
}

export default FirstTimeHint;