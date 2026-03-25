import { useState, useEffect, useCallback } from "react";
import { Linkedin, RefreshCw, Unlink, Loader2, CheckCircle2, AlertCircle, Clock, Database, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";

interface LinkedInConnectionStatus {
  connected: boolean;
  connection?: {
    id: string;
    linkedin_id: string;
    display_name: string;
    connected_at: string;
    last_synced_at: string | null;
  };
}

interface LinkedInConnectorProps {
  onConnectionChange?: (connected: boolean, info?: any) => void;
  onSyncStateChange?: (syncing: boolean, failed?: boolean) => void;
}

const LinkedInConnector = ({ onConnectionChange, onSyncStateChange }: LinkedInConnectorProps) => {
  const [status, setStatus] = useState<LinkedInConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const { toast } = useToast();

  const checkStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus({ connected: false }); setLoading(false); return; }

      const [statusRes, snapshotRes] = await Promise.all([
        supabase.functions.invoke("linkedin-oauth", { body: { action: "status" } }),
        (supabase.from("influence_snapshots" as any) as any).select("id, post_count").order("snapshot_date", { ascending: false }).limit(30),
      ]);

      if (statusRes.error) {
        setStatus({ connected: false });
      } else {
        setStatus(statusRes.data);
        onConnectionChange?.(statusRes.data?.connected || false, statusRes.data?.connection || null);
      }

      const snaps = snapshotRes.data || [];
      setSnapshotCount(snaps.length);
      setPostCount(snaps[0]?.post_count || 0);
    } catch {
      setStatus({ connected: false });
    }
    setLoading(false);
  }, [onConnectionChange]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "get-auth-url", origin: window.location.origin },
      });
      if (error || !data?.url) {
        toast({ title: "Error", description: "Could not generate LinkedIn authorization URL.", variant: "destructive" });
        setConnecting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      toast({ title: "Error", description: "Failed to initiate LinkedIn connection.", variant: "destructive" });
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    onSyncStateChange?.(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-sync", {});
      if (error || !data?.success) {
        toast({ title: "Sync failed", description: data?.error || "Could not sync LinkedIn data.", variant: "destructive" });
        onSyncStateChange?.(false, true);
      } else {
        const summary = data.summary;
        const desc = summary
          ? `Analyzed ${summary.postsAnalyzed} posts · ${summary.themesDetected} themes detected`
          : data.note || "LinkedIn analytics updated.";
        toast({ title: "Sync complete", description: desc });
        onSyncStateChange?.(false, false);
        checkStatus();
      }
    } catch {
      toast({ title: "Error", description: "Failed to sync LinkedIn data.", variant: "destructive" });
      onSyncStateChange?.(false, true);
    }
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", { body: { action: "disconnect" } });
      if (error || !data?.success) {
        toast({ title: "Error", description: "Could not disconnect LinkedIn.", variant: "destructive" });
      } else {
        toast({ title: "Disconnected", description: "LinkedIn account has been disconnected." });
        onConnectionChange?.(false);
        setStatus({ connected: false });
        setSnapshotCount(0);
        setPostCount(0);
      }
    } catch {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    }
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
          <span className="text-sm text-muted-foreground/60">Checking LinkedIn connection…</span>
        </div>
      </div>
    );
  }

  const isConnected = status?.connected;
  const lastSynced = status?.connection?.last_synced_at;

  return (
    <section>
      <h2 className="text-section-title text-foreground mb-2">LinkedIn Status</h2>
      <p className="text-meta mb-6">Verified data connection powering all insights below.</p>

      <div className="glass-card rounded-2xl p-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[hsl(207_100%_62%/0.12)] flex items-center justify-center border border-[hsl(207_100%_62%/0.2)]">
              <Linkedin className="w-5 h-5 text-[hsl(207_100%_62%)]" />
            </div>
            <div>
              <h3 className="text-card-title text-foreground">LinkedIn Connection</h3>
              <p className="text-xs text-muted-foreground/50">
                {isConnected ? "Read-only access · No publishing" : "Connect to sync analytics"}
              </p>
            </div>
          </div>

          {isConnected && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/8 border border-emerald-500/15">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">Connected</span>
            </div>
          )}
        </div>

        {isConnected ? (
          <div className="space-y-6">
            {/* Status chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-label text-[10px]">Status</span>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {syncing ? "Syncing…" : "Active"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-label text-[10px]">Last Sync</span>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {lastSynced ? formatSmartDate(lastSynced) : "Never"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-label text-[10px]">Posts</span>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums">{postCount}</p>
              </div>

              <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <Database className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-label text-[10px]">Snapshots</span>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums">{snapshotCount}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 text-xs"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                {syncing ? "Syncing…" : "Sync Now"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10"
              >
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5 mr-1.5" />}
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[hsl(207_100%_62%/0.05)] border border-[hsl(207_100%_62%/0.1)]">
              <AlertCircle className="w-4 h-4 text-[hsl(207_100%_62%/0.6)] mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground/70 leading-relaxed">
                Connect your LinkedIn account to sync follower analytics, post performance, and engagement trends. Read-only access — Aura will never post on your behalf.
              </p>
            </div>
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full bg-[hsl(207_100%_62%)] hover:bg-[hsl(207_100%_45%)] text-white border-0"
            >
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Linkedin className="w-4 h-4 mr-2" />}
              {connecting ? "Connecting…" : "Connect LinkedIn"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default LinkedInConnector;
