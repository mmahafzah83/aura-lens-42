import { Link, Mic, Type, ExternalLink } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const iconMap = {
  link: Link,
  voice: Mic,
  text: Type,
};

const pillarColors: Record<string, string> = {
  Strategy: "bg-primary/15 text-primary",
  Technology: "bg-primary/15 text-primary",
  Utilities: "bg-primary/15 text-primary",
  Leadership: "bg-primary/15 text-primary",
  Brand: "bg-primary/15 text-primary",
};

const RecentEntries = ({ entries }: { entries: Entry[] }) => {
  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-semibold text-foreground mb-1">Recent Captures</h3>
      <p className="text-xs text-muted-foreground mb-5 tracking-wide uppercase">Latest intelligence entries</p>
      <div className="space-y-4 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No entries yet. Start capturing.</p>
        ) : (
          entries.slice(0, 8).map((entry) => {
            const Icon = iconMap[entry.type as keyof typeof iconMap] || Type;
            const entryAny = entry as any;
            const pillar = entryAny.skill_pillar;
            const title = entryAny.title;
            const isLink = entry.type === "link";

            return (
              <div
                key={entry.id}
                className="flex items-start gap-4 p-4 rounded-xl bg-secondary/40 border border-border/20 hover:bg-secondary/60 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {isLink && title ? (
                    <a
                      href={entry.content}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5 group"
                    >
                      {title}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <p className="text-sm text-foreground truncate">{entry.content}</p>
                  )}
                  {entry.summary && (
                    <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4 leading-relaxed">{entry.summary}</p>
                  )}
                  <div className="flex items-center gap-2 pt-0.5">
                    {pillar && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pillarColors[pillar] || "bg-secondary text-muted-foreground"}`}>
                        {pillar}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RecentEntries;
