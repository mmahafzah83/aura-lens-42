import { WIDGET_DEFS } from "./widgetData";
import { useWidgetData } from "./useWidgetData";
import { WidgetBody } from "./WidgetCards";

/**
 * HomeWidgetRegion — the widget region on Home. A single self-contained
 * sibling section: it never restructures the signed-off Home layout, and it
 * renders nothing at all when the user has switched every widget off.
 */
export default function HomeWidgetRegion({ userId }: { userId: string | null }) {
  const { layout, metrics } = useWidgetData(userId);

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
