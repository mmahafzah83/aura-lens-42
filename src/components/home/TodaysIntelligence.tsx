import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BriefingItem {
  title?: string;
  source?: string;
  url?: string | null;
  bluf?: string;
  icon?: string;
  gap_alignment?: string;
  type?: string;
}

interface BriefingResponse {
  items?: BriefingItem[];
  generated_at?: string;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function TodaysIntelligence() {
  const [items, setItems] = useState<BriefingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const date = todayKey();
    const cacheKey = `briefing_${date}`;
    const viewedKey = `briefing_viewed_${date}`;
    const expandedKey = `briefing_expanded_${date}`;

    // Expanded state: explicit toggle wins; otherwise expanded on first view of the day.
    const storedExpanded = localStorage.getItem(expandedKey);
    if (storedExpanded !== null) {
      setExpanded(storedExpanded === "1");
    } else {
      const firstView = !localStorage.getItem(viewedKey);
      setExpanded(firstView);
      localStorage.setItem(viewedKey, "1");
    }

    const run = async () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as BriefingResponse;
          const list = (parsed.items || []).filter(Boolean);
          if (list.length === 0) {
            setFailed(true);
          } else {
            setItems(list);
          }
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke("daily-briefing", { body: {} });
        if (error) throw error;
        const list = ((data as BriefingResponse)?.items || []).filter(Boolean);
        if (list.length === 0) {
          setFailed(true);
        } else {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
          setItems(list);
        }
      } catch (e) {
        console.warn("[TodaysIntelligence] failed", e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(`briefing_expanded_${todayKey()}`, next ? "1" : "0");
      return next;
    });
  };

  // Hide entirely on failure or empty
  if (failed || (!loading && (!items || items.length === 0))) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        border: "1px solid hsl(var(--border) / 0.6)",
        borderRadius: 10,
        background: "hsl(var(--card) / 0.5)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={toggle}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full"
        style={{
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span className="flex items-center" style={{ gap: 8 }}>
          <Sparkles size={14} style={{ color: "var(--brand)" }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "hsl(var(--foreground))",
            }}
          >
            Today's intelligence
          </span>
          {loading && (
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>loading…</span>
          )}
        </span>
        <ChevronDown
          size={16}
          style={{
            transition: "transform 200ms ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            color: "hsl(var(--muted-foreground))",
          }}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && !loading && items && items.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "4px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {items.slice(0, 3).map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    paddingTop: 10,
                    borderTop: idx === 0 ? "none" : "1px solid hsl(var(--border) / 0.4)",
                  }}
                >
                  <div className="flex items-start" style={{ gap: 8 }}>
                    {item.icon && (
                      <span style={{ fontSize: 14, lineHeight: "20px" }}>{item.icon}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {item.title && (
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "hsl(var(--foreground))",
                            marginBottom: 2,
                          }}
                        >
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "inherit", textDecoration: "none" }}
                            >
                              {item.title}
                            </a>
                          ) : (
                            item.title
                          )}
                        </div>
                      )}
                      {item.bluf && (
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: "hsl(var(--muted-foreground))",
                          }}
                        >
                          {item.bluf}
                        </div>
                      )}
                      {item.source && (
                        <div
                          style={{
                            fontSize: 12,
                            marginTop: 4,
                            color: "hsl(var(--muted-foreground))",
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.source}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}