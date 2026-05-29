import { useState, useEffect } from "react";

interface FirstTimeHintProps {
  hintKey: string;
  children: string;
}

export function FirstTimeHint({ hintKey, children }: FirstTimeHintProps) {
  const storageKey = `aura_hint_${hintKey}`;
  const [visible, setVisible] = useState(false);

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
        background: "rgba(176,141,58,0.06)",
        border: "0.5px solid rgba(176,141,58,0.25)",
        animation: "hintFadeIn 240ms ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ color: "#B08D3A", fontSize: 13, lineHeight: "20px", flexShrink: 0 }}>✦</span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: "hsl(var(--foreground))" }}>{children}</span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        style={{
          background: "none",
          border: "none",
          color: "#B08D3A",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          padding: "2px 6px",
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