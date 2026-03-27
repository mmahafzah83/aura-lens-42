import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, Clock, User, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

interface ConnectionData {
  id: string;
  handle: string | null;
  profile_name: string | null;
  display_name: string | null;
  profile_url: string | null;
  status: string;
  source_status: string;
  last_synced_at: string | null;
  connected_at: string | null;
}

const ConnectionStatusPanel = () => {
  const [connection, setConnection] = useState<ConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState<string | null>(null);

  useEffect(() => {
    loadConnection();
  }, []);

  const loadConnection = async () => {
    try {
      const { data } = await supabase
        .from("linkedin_connections")
        .select("id, handle, profile_name, display_name, profile_url, status, source_status, last_synced_at, connected_at")
        .order("created_at", { ascending: false })
        .limit(1);
      setConnection((data?.[0] as ConnectionData) || null);

      const { data: snap } = await supabase
        .from("influence_snapshots")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);
      setLatestSnapshot(snap?.[0]?.snapshot_date || null);
    } catch {
      // silent
    }
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("linkedin-sync", { body: {} });
      await loadConnection();
    } catch {
      // silent
    }
    setSyncing(false);
  };

  const isConnected = connection?.status === "active";
  const displayName = connection?.profile_name || connection?.display_name || "Unknown";
  const handle = connection?.handle || null;

  const daysSinceSync = connection?.last_synced_at
    ? Math.floor((Date.now() - new Date(connection.last_synced_at).getTime()) / 86400000)
    : null;

  const freshnessLabel =
    daysSinceSync === null ? "Never synced" :
    daysSinceSync === 0 ? "Fresh — synced today" :
    daysSinceSync <= 1 ? "Fresh — synced yesterday" :
    daysSinceSync <= 7 ? `${daysSinceSync}d ago — acceptable` :
    `${daysSinceSync}d ago — stale`;

  const freshnessColor =
    daysSinceSync === null ? "text-muted-foreground/50" :
    daysSinceSync <= 1 ? "text-emerald-400" :
    daysSinceSync <= 7 ? "text-amber-400" :
    "text-red-400";

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
            isConnected ? "bg-emerald-500/10 border-emerald-500/20" : "bg-muted/20 border-border/15"
          }`}>
            {isConnected ? <Wifi className="w-5 h-5 text-emerald-400" /> : <WifiOff className="w-5 h-5 text-muted-foreground/40" />}
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Connection Status</h3>
            <p className="text-meta">LinkedIn account link and data freshness</p>
          </div>
        </div>

        {isConnected && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-primary/70 hover:text-primary px-3 py-1.5 rounded-lg bg-primary/6 hover:bg-primary/12 border border-primary/8 transition-all tactile-press disabled:opacity-40"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync Now
          </button>
        )}
      </div>

      {!isConnected ? (
        <div className="text-center py-6">
          <WifiOff className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-foreground font-medium">No LinkedIn account connected</p>
          <p className="text-meta mt-1 max-w-xs mx-auto">Connect your LinkedIn in the Identity tab to begin building your authority history.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Account */}
          <div className="p-4 rounded-xl bg-secondary/15 border border-border/8 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-label text-xs uppercase tracking-widest">Account</span>
            </div>
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            {handle && <p className="text-meta truncate">@{handle}</p>}
            {connection.profile_url && (
              <a href={connection.profile_url} target="_blank" rel="noopener noreferrer" className="text-meta flex items-center gap-1 hover:text-primary transition-colors">
                <ExternalLink className="w-3 h-3" /> View profile
              </a>
            )}
          </div>

          {/* Last Sync */}
          <div className="p-4 rounded-xl bg-secondary/15 border border-border/8 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-label text-xs uppercase tracking-widest">Last Sync</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {connection.last_synced_at ? formatSmartDate(connection.last_synced_at) : "Never"}
            </p>
            <p className={`text-xs font-medium ${freshnessColor}`}>{freshnessLabel}</p>
          </div>

          {/* Data Freshness */}
          <div className="p-4 rounded-xl bg-secondary/15 border border-border/8 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-label text-xs uppercase tracking-widest">Latest Snapshot</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {latestSnapshot || "None"}
            </p>
            <p className="text-meta">
              {connection.connected_at ? `Connected ${formatSmartDate(connection.connected_at)}` : ""}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ConnectionStatusPanel;
