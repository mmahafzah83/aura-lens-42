import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

const ConnectionStatusPanel = () => {
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("linkedin_connections")
          .select("id, handle, profile_name, display_name, profile_url, status, connected_at")
          .order("created_at", { ascending: false })
          .limit(1);
        setConnection(data?.[0] || null);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const isConnected = connection?.status === "active";
  const displayName = connection?.profile_name || connection?.display_name || null;
  const handle = connection?.handle || null;

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 flex items-center justify-center min-h-[80px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-border/8"
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-primary/60" : "bg-muted-foreground/20"}`} />
        <User2 className="w-3.5 h-3.5 text-muted-foreground/30" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {isConnected ? (displayName || "LinkedIn Identity") : "LinkedIn Not Connected"}
          </h3>
          <p className="text-meta mt-0.5">
            {isConnected
              ? `${handle ? `@${handle} · ` : ""}Identity linked ${connection?.connected_at ? formatSmartDate(connection.connected_at) : ""}`
              : "Connect in the Identity tab to link your LinkedIn profile."
            }
          </p>
        </div>
      </div>

      {isConnected && (
        <p className="text-[10px] text-muted-foreground/25 mt-2.5 leading-relaxed max-w-sm">
          Identity metadata only — import your LinkedIn analytics XLSX export to populate performance data.
        </p>
      )}
    </motion.div>
  );
};

export default ConnectionStatusPanel;
