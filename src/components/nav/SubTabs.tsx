/**
 * SubTabs — the segmented control that appears at the top of a destination
 * holding more than one tab (Signals, Write, Record, You). Two mono labels;
 * the active one carries the action colour.
 */
interface SubTabsProps {
  options: Array<{ value: string; label: string }>;
  active: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
}

export default function SubTabs({ options, active, onSelect, ariaLabel }: SubTabsProps) {
  if (options.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center mb-5"
      style={{
        gap: 2,
        padding: 3,
        borderRadius: 10,
        background: "var(--surface-subtle)",
        border: "1px solid var(--border-default)",
        width: "fit-content",
      }}
    >
      {options.map((o) => {
        const isActive = o.value === active;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            id={`subtab-${o.value}`}
            aria-selected={isActive}
            aria-controls={`subpanel-${o.value}`}
            data-testid={`subtab-${o.value}`}
            className="cursor-pointer v23-focus"
            onClick={() => { if (!isActive) onSelect(o.value); }}
            style={{
              fontFamily: "var(--ff-mono)",
              fontSize: 11,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              padding: "7px 14px",
              minHeight: 34,
              borderRadius: 8,
              border: 0,
              cursor: isActive ? "default" : "pointer",
              background: isActive ? "var(--act)" : "transparent",
              color: isActive ? "var(--text-inverse)" : "var(--text-secondary)",
              transition: "background 160ms ease, color 160ms ease",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
