import { useEffect, useState } from "react";
import { loadLayout, loadWidgetMetrics, DEFAULT_LAYOUT, WIDGET_DEFS } from "./widgetData";
import type { WidgetLayout, WidgetMetrics } from "./widgetData";
import { WidgetBody } from "./WidgetCards";

/**
 * HomeWidgetRegion — the widget region on Home. A single self-contained
 * sibling section: it never restructures the signed-off Home layout, and it
 * renders nothing at all when the user has switched every widget off.
 */
export default function HomeWidgetRegion({ userId }: { userId: string | null }) {
  const [layout, setLayout] = useState<WidgetLayout>(DEFAULT_LAYOUT);
  const [metrics, setMetrics] = useState<WidgetMetrics | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [l, m] = await Promise.all([loadLayout(userId), loadWidgetMetrics(userId)]);
      if (!alive) return;
      setLayout(l);
      setMetrics(m);
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!metrics) return null;
  const on = WIDGET_DEFS.filter(d => layout[d.key]);
  if (on.length === 0) return null;

  return (
    <section
      data-testid="home-widget-region"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}
    >
      {on.map(d => <WidgetBody key={d.key} k={d.key} m={metrics} />)}
    </section>
  );
}
