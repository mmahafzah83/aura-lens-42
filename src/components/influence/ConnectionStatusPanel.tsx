import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

const ConnectionStatusPanel = () => {
  const { toast } = useToast();
  const [connection, setConnection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<string | null>(null);

  useEffect(() => { loadConnection(); }, []);

  const loadConnection = async () => {
    try {
      const { data } = await supabase
        .from("linkedin_connections")
        .select("id, handle, profile_name, display_name, profile_url, status, source_status, last_synced_at, connected_at")
        .order("created_at", { ascending: false })
        .limit(1);
      setConnection(data?.[0] || null);

      const { data: snap } = await supabase
        .from("influence_snapshots")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      setLatestSnapshot(snap?.[0]?.snapshot_date || null);
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("linkedin-sync", { body: {} });
      await loadConnection();
    } catch { /* silent */ }
    setSyncing(false);
  };

  const isConnected = connection?.status === "active";
  const displayName = connection?.profile_name || connection?.display_name || null;

  const daysSinceSync = connection?.last_synced_at
    ? Math.floor((Date.now() - new Date(connection.last_synced_at).getTime()) / 86400000)
    : null;

  const freshnessLabel =
    daysSinceSync === null ? "Awaiting first sync" :
    daysSinceSync <= 1 ? "Current" :
    daysSinceSync <= 7 ? `${daysSinceSync} days ago` :
    `${daysSinceSync} days — consider syncing`;

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 flex items-center justify-center min-h-[100px]">
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-primary/60" : "bg-muted-foreground/20"}`} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {isConnected ? (displayName || "LinkedIn Connected") : "LinkedIn Not Connected"}
            </h3>
            <p className="text-meta mt-0.5">
              {isConnected
                ? `Last sync: ${connection?.last_synced_at ? formatSmartDate(connection.last_synced_at) : "never"} · ${freshnessLabel}`
                : "Connect in the Identity tab to begin preserving your authority history."
              }
            </p>
          </div>
        </div>

        {isConnected && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary/20 border border-border/8 transition-all tactile-press disabled:opacity-30"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync
          </button>
        )}
      </div>

      {isConnected && latestSnapshot && (
        <p className="text-[10px] text-muted-foreground/30 mt-3 tracking-wide">
          Latest snapshot: {latestSnapshot} · Connected {connection?.connected_at ? formatSmartDate(connection.connected_at) : ""}
        </p>
      )}
    </motion.div>
  );
};

export default ConnectionStatusPanel;
