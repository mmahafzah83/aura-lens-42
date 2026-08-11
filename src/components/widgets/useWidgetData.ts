import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadLayout, loadWidgetMetrics, DEFAULT_LAYOUT, WIDGET_LAYOUT_EVENT,
  type WidgetLayout, type WidgetMetrics,
} from "./widgetData";

/**
 * useWidgetData — the one reader of the member's widget layout and numbers.
 * Re-reads on mount, on window focus, and whenever a layout write announces
 * itself, so a widget added on the Widgets page shows up on Home immediately.
 */
export function useWidgetData(userId: string | null | undefined) {
  const [layout, setLayout] = useState<WidgetLayout>(DEFAULT_LAYOUT);
  const [metrics, setMetrics] = useState<WidgetMetrics | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    try {
      const [l, m] = await Promise.all([loadLayout(userId), loadWidgetMetrics(userId)]);
      if (!alive.current) return;
      setLayout(l); setMetrics(m);
    } catch { /* noop — the region simply keeps what it had */ }
    finally { inFlight.current = false; }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ userId?: string }>).detail;
      if (d?.userId && d.userId !== userId) return;
      void load();
    };
    const onFocus = () => void load();
    window.addEventListener(WIDGET_LAYOUT_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(WIDGET_LAYOUT_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, load]);

  return { layout, metrics, reload: load };
}

export default useWidgetData;
