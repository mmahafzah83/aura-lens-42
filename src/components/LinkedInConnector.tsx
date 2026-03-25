import { useState, useEffect, useCallback } from "react";
import { Linkedin, RefreshCw, Unlink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

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

const LinkedInConnector = ({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) => {
  const [status, setStatus] = useState<LinkedInConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast } = useToast();

  const checkStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus({ connected: false });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "status" },
      });

      if (error) {
        console.error("Status check error:", error);
        setStatus({ connected: false });
      } else {
        setStatus(data);
        onConnectionChange?.(data?.connected || false);
      }
    } catch {
      setStatus({ connected: false });
    }
    setLoading(false);
  }, [onConnectionChange]);

  // Check for LinkedIn callback temp_id in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tempId = params.get("linkedin_temp_id");
    if (tempId) {
      // Remove from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("linkedin_temp_id");
      window.history.replaceState({}, "", url.toString());

      // Claim the connection
      claimConnection(tempId);
    } else {
      checkStatus();
    }
  }, [checkStatus]);

  const claimConnection = async (tempId: string) => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-claim", {
        body: { temp_id: tempId },
      });

      if (error || !data?.success) {
        toast({ title: "Connection failed", description: "Could not link LinkedIn account.", variant: "destructive" });
      } else {
        toast({ title: "LinkedIn Connected", description: `Connected as ${data.connection?.display_name || "LinkedIn User"}` });
        onConnectionChange?.(true);
      }
    } catch {
      toast({ title: "Error", description: "Failed to complete LinkedIn connection.", variant: "destructive" });
    }
    setConnecting(false);
    checkStatus();
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "get-auth-url", origin },
      });

      if (error || !data?.url) {
        toast({ title: "Error", description: "Could not generate LinkedIn authorization URL.", variant: "destructive" });
        setConnecting(false);
        return;
      }

      // Redirect to LinkedIn OAuth
      window.location.href = data.url;
    } catch {
      toast({ title: "Error", description: "Failed to initiate LinkedIn connection.", variant: "destructive" });
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-sync", {});

      if (error || !data?.success) {
        toast({ title: "Sync failed", description: data?.error || "Could not sync LinkedIn data.", variant: "destructive" });
      } else {
        toast({ title: "Sync complete", description: data.note || "LinkedIn analytics updated." });
        checkStatus();
      }
    } catch {
      toast({ title: "Error", description: "Failed to sync LinkedIn data.", variant: "destructive" });
    }
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "disconnect" },
      });

      if (error || !data?.success) {
        toast({ title: "Error", description: "Could not disconnect LinkedIn.", variant: "destructive" });
      } else {
        toast({ title: "Disconnected", description: "LinkedIn account has been disconnected." });
        onConnectionChange?.(false);
        setStatus({ connected: false });
      }
    } catch {
      toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
    }
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
          <span className="text-sm text-muted-foreground/60">Checking LinkedIn connection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl card-pad">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#0A66C2]/15 flex items-center justify-center border border-[#0A66C2]/20">
          <Linkedin className="w-5 h-5 text-[#0A66C2]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">LinkedIn Connection</h3>
          <p className="text-xs text-muted-foreground/50">
            {status?.connected ? "Connected · Read-only access" : "Connect to sync analytics"}
          </p>
        </div>
        {status?.connected && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">Active</span>
          </div>
        )}
      </div>

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{status.connection?.display_name}</p>
              {status.connection?.last_synced_at && (
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                  Last synced: {new Date(status.connection.last_synced_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="flex-1 border-border/15 text-xs"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5 mr-1.5" />}
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0A66C2]/5 border border-[#0A66C2]/10">
            <AlertCircle className="w-3.5 h-3.5 text-[#0A66C2]/60 mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              Connect your LinkedIn account to sync follower analytics, post performance, and engagement trends. Read-only access — Aura will never post on your behalf.
            </p>
          </div>
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full bg-[#0A66C2] hover:bg-[#004182] text-white border-0"
          >
            {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Linkedin className="w-4 h-4 mr-2" />}
            {connecting ? "Connecting..." : "Connect LinkedIn"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default LinkedInConnector;
