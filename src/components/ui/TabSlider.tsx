import { useEffect, useRef, useState } from "react";

/**
 * Sprint F2 — Part D
 * Reusable sliding tab indicator. Use by:
 *   1. Adding `aura-tab-bar` class to your tab bar container.
 *   2. Adding `data-aura-tab="true"` to each tab button.
 *   3. Adding `data-aura-tab-active="true"` to the active tab button.
 *   4. Rendering <TabSlider /> as a child of the tab bar container.
 *
 * The indicator measures the active tab's offsetLeft / offsetWidth and
 * animates via CSS transition. Globally gated by [data-fx-tab-slider="true"].
 */
export function TabSlider({ deps = [] as unknown[] }: { deps?: unknown[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bar = el.parentElement;
    if (!bar) return;
    const measure = () => {
      const active = bar.querySelector<HTMLElement>("[data-aura-tab-active='true']");
      if (!active) {
        setPos(null);
        return;
      }
      setPos({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    bar.querySelectorAll<HTMLElement>("[data-aura-tab='true']").forEach((t) => ro.observe(t));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <span
      ref={ref}
      className="aura-tab-indicator"
      aria-hidden="true"
      style={{
        left: pos?.left ?? 0,
        width: pos?.width ?? 0,
        opacity: pos ? 1 : 0,
      }}
    />
  );
}

export default TabSlider;