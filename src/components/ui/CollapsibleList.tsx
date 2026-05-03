import React, { useState, ReactNode } from "react";

export interface CollapsibleListProps<T> {
  items: T[];
  visibleCount?: number;
  renderItem: (item: T, index: number) => ReactNode;
  label?: string;
}

export function CollapsibleList<T>({
  items,
  visibleCount = 3,
  renderItem,
  label,
}: CollapsibleListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > visibleCount;
  const shown = expanded || !hasMore ? items : items.slice(0, visibleCount);

  return (
    <div>
      {shown.map((item, i) => (
        <div
          key={i}
          style={
            expanded && i >= visibleCount
              ? {
                  animation: "fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
                  animationDelay: `${(i - visibleCount) * 40}ms`,
                }
              : undefined
          }
        >
          {renderItem(item, i)}
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          style={{
            background: "none",
            border: 0,
            padding: "8px 0",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--brand, #B08D3A)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {expanded
            ? "Show less"
            : `Show all ${items.length}${label ? ` ${label}` : ""} →`}
        </button>
      )}
    </div>
  );
}

export default CollapsibleList;