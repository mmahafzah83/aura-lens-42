import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { applyPublishedFilter, filterPublishedRows } from "@/lib/postProvenance";

interface RhythmItem {
  id: "capture" | "publish" | "voice";
  title: string;
  description: string;
  done: boolean;
}

interface MissionControlProps {
  userId: string | null;
  entriesCount?: number;
  topSignalTitle?: string;
  topSignalFragments?: number;
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
  onSwitchTab?: (tab: any) => void;
}

export default function MissionControl({
  userId,
  entriesCount = 0,
  topSignalTitle,
  topSignalFragments,
  onOpenCapture,
  onSwitchTab,
}: MissionControlProps) {
  const [items, setItems] = useState<RhythmItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      // Rolling 7-day window, user-scoped.
      const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [entriesRes, postsRes, voiceRes] = await Promise.all([
        supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", weekStart),
        applyPublishedFilter(
          (supabase
            .from("linkedin_posts")
            .select("id, source_type, tracking_status, published_confirmed_at, published_at")
            .eq("user_id", userId)
            .or(`published_confirmed_at.gte.${weekStart},published_at.gte.${weekStart}`)
            .limit(50) as any),
        ),
        supabase
          .from("authority_voice_profiles")
          .select("example_posts")
          .eq("user_id", userId)
          .eq("is_primary", true)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const capturedThisWeek = (entriesRes.count ?? 0) > 0;
      const publishedThisWeek =
        filterPublishedRows(((postsRes as any).data as any[]) || []).length > 0;
      const examples = (voiceRes.data as any)?.example_posts;
      const voiceTrained = Array.isArray(examples) && examples.length >= 2;

      const publishDesc = topSignalTitle
        ? `Your ${topSignalTitle} signal has ${topSignalFragments ?? 0} fragment${(topSignalFragments ?? 0) === 1 ? "" : "s"}. Share your perspective.`
        : "Draft a LinkedIn post from your strongest signal.";

      setItems([
        {
          id: "capture",
          title: "Capture a source",
          description: "Save an article about your sector. Aura extracts the strategic pattern.",
          done: capturedThisWeek,
        },
        {
          id: "publish",
          title: "Publish a post",
          description: publishDesc,
          done: publishedThisWeek,
        },
        {
          id: "voice",
          title: "Train your voice",
          description: "Paste 2 LinkedIn posts you've written before so generated content sounds like you.",
          done: voiceTrained,
        },
      ]);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId, entriesCount, topSignalTitle, topSignalFragments]);

  const handleNudge = (item: RhythmItem) => {
    if (item.done) return;
    if (item.id === "capture") onOpenCapture?.();
    else if (item.id === "publish") onSwitchTab?.("authority");
    else if (item.id === "voice") onSwitchTab?.("identity");
  };

  const done = items.filter(i => i.done).length;
  const total = items.length;

  return (
    <section style={{ borderTop: "0.5px solid hsl(var(--border) / 0.5)", paddingTop: 20 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
          color: "hsl(var(--muted-foreground))", textTransform: "uppercase",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          This Week's Rhythm
          <InfoTooltip
            label="Weekly rhythm"
            text="Three habits that compound your presence. Ticks automatically as you capture, publish, and train your voice."
            side="bottom"
            triggerSize={14}
          />
        </span>
        {total > 0 && (
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {done} of {total}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 12, lineHeight: 1.5 }}>
        Three habits that compound your presence. Each ticks automatically when you do it.
      </div>

      {!loaded ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, i) => {
            const clickable = !item.done && (
              (item.id === "capture" && !!onOpenCapture) ||
              (item.id !== "capture" && !!onSwitchTab)
            );
            return (
              <div
                key={item.id}
                className="flex animate-fade-up-in"
                onClick={clickable ? () => handleNudge(item) : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                style={{
                  gap: 12, padding: "12px 14px",
                  border: "0.5px solid hsl(var(--border) / 0.5)",
                  borderRadius: 8,
                  alignItems: "flex-start",
                  background: "hsl(var(--card))",
                  animationDelay: `${Math.min(i * 60, 480)}ms`,
                  animationFillMode: "backwards",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                <div
                  aria-label={item.done ? "Completed" : "Pending"}
                  style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: item.done ? "0" : "1.5px solid var(--ink-4)",
                    background: item.done ? "var(--success)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: 1,
                  }}
                >
                  {item.done && <Check size={11} color="#fff" strokeWidth={3} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: item.done ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                    textDecoration: item.done ? "line-through" : "none",
                    lineHeight: 1.4,
                  }}>
                    {item.title}
                  </div>
                  <div style={{
                    fontSize: 11, color: "hsl(var(--muted-foreground))",
                    marginTop: 2, lineHeight: 1.45,
                  }}>
                    {item.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}