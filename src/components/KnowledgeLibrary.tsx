import { useState, useEffect } from "react";
import { Search, Link, Mic, Type, FileUp, FileText, ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KnowledgeItem {
  id: string;
  type: "entry" | "document";
  title: string;
  subtype: string;
  date: string;
  pillar?: string | null;
}

const ENTRY_ICONS: Record<string, typeof Link> = { link: Link, voice: Mic, text: Type, image: ImageIcon };

const KnowledgeLibrary = () => {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "note" | "link" | "voice" | "document">("all");

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    const [entriesRes, docsRes] = await Promise.all([
      supabase.from("entries").select("id, type, title, content, skill_pillar, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("documents").select("id, filename, file_type, created_at").order("created_at", { ascending: false }).limit(100),
    ]);

    const entryItems: KnowledgeItem[] = (entriesRes.data || []).map((e: any) => ({
      id: e.id, type: "entry", title: e.title || e.content?.slice(0, 80) || "Untitled",
      subtype: e.type, date: e.created_at, pillar: e.skill_pillar,
    }));

    const docItems: KnowledgeItem[] = (docsRes.data || []).map((d: any) => ({
      id: d.id, type: "document", title: d.filename,
      subtype: d.file_type, date: d.created_at, pillar: null,
    }));

    setItems([...entryItems, ...docItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setLoading(false);
  };

  const filtered = items.filter((item) => {
    if (filter !== "all") {
      if (filter === "note" && item.subtype !== "text") return false;
      if (filter === "link" && item.subtype !== "link") return false;
      if (filter === "voice" && item.subtype !== "voice") return false;
      if (filter === "document" && item.type !== "document") return false;
    }
    if (search.trim()) {
      return item.title.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const FILTERS = [
    { key: "all" as const, label: "All" },
    { key: "note" as const, label: "Notes" },
    { key: "link" as const, label: "Links" },
    { key: "voice" as const, label: "Voice" },
    { key: "document" as const, label: "Documents" },
  ];

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <FileText className="w-4 h-4 text-primary/70" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Knowledge Library</h3>
          <p className="text-[10px] text-muted-foreground/40">All captured knowledge in one place</p>
        </div>
        <span className="ml-auto text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{items.length}</span>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search library…"
            className="w-full pl-9 pr-4 py-2.5 bg-secondary/30 border border-border/15 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                filter === f.key ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/20 text-muted-foreground/50 hover:text-muted-foreground border border-transparent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : (
        <ScrollArea className="h-[320px]">
          <div className="space-y-2 pr-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground/40 text-center py-8">No items found</p>
            ) : (
              filtered.map((item) => {
                const Icon = item.type === "document" ? FileUp : (ENTRY_ICONS[item.subtype] || Type);
                return (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 hover:bg-secondary/30 transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-primary/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate" dir="auto">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground/40 capitalize">{item.type === "document" ? "Document" : item.subtype}</span>
                        {item.pillar && <span className="text-[9px] bg-primary/10 text-primary/60 px-1.5 py-0.5 rounded-full">{item.pillar}</span>}
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground/30 shrink-0">{formatSmartDate(item.date)}</span>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default KnowledgeLibrary;
