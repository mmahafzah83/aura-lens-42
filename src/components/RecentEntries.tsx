import { Link, Mic, Type } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const iconMap = {
  link: Link,
  voice: Mic,
  text: Type,
};

const RecentEntries = ({ entries }: { entries: Entry[] }) => {
  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-semibold text-foreground mb-2">Recent Captures</h3>
      <p className="text-sm text-muted-foreground mb-4">Latest intelligence entries</p>
      <div className="space-y-3 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No entries yet. Start capturing.</p>
        ) : (
          entries.slice(0, 5).map((entry) => {
            const Icon = iconMap[entry.type as keyof typeof iconMap] || Type;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border/30 hover:bg-secondary/80 transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{entry.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </p>
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
