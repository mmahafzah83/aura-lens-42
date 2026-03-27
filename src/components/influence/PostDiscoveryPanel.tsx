import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, CheckCircle2, AlertCircle, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatSmartDate } from "@/lib/formatDate";

interface Props {
  onDiscoveryComplete?: () => void;
}

const PostDiscoveryPanel = ({ onDiscoveryComplete }: Props) => {
  const { toast } = useToast();
  const [discovering, setDiscovering] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [needsUrl, setNeedsUrl] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);
  const [result, setResult] = useState<{
    discovered: number;
    inserted: number;
    duplicates: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLastRun();
  }, []);

  const loadLastRun = async () => {
    const { data } = await supabase
      .from("sync_runs")
      .select("completed_at, records_fetched, records_stored, status")
      .eq("sync_type", "discovery")
      .order("completed_at", { ascending: false })
      .limit(1);
    if (data?.[0]) setLastRun(data[0]);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setResult(null);
    setError(null);

    try {
      const body: any = {};
      if (profileUrl.trim()) body.profile_url = profileUrl.trim();

      const { data, error: fnErr } = await supabase.functions.invoke(
        "discover-linkedin-posts",
        { body }
      );

      if (fnErr) {
        setError(fnErr.message || "Discovery failed");
        toast({ title: "Discovery failed", description: fnErr.message, variant: "destructive" });
      } else if (!data?.success) {
        if (data?.needs_profile_url) {
          setNeedsUrl(true);
          setError(data?.error);
        } else {
          setError(data?.error || "No posts discovered");
        }
      } else {
        setResult({
          discovered: data.discovered,
          inserted: data.inserted,
          duplicates: data.duplicates,
        });
        toast({
          title: "Posts discovered",
          description: `${data.inserted} new posts added, ${data.duplicates} duplicates skipped.`,
        });
        onDiscoveryComplete?.();
        await loadLastRun();
      }
    } catch (e: any) {
      setError(e.message || "Unexpected error");
    }
    setDiscovering(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4 text-primary/40" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Post Discovery</h3>
            <p className="text-meta mt-0.5">
              Scrape your LinkedIn profile to discover and store published posts
            </p>
          </div>
        </div>
        {lastRun && (
          <p className="text-[10px] text-muted-foreground/30">
            Last run: {formatSmartDate(lastRun.completed_at)} · {lastRun.records_stored || 0} stored
          </p>
        )}
      </div>

      {/* Profile URL input (shown when needed) */}
      {needsUrl && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground/50">
            Enter your LinkedIn profile URL to begin discovery.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/30" />
              <input
                type="url"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/yourhandle"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/10 border border-border/10 text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={handleDiscover}
        disabled={discovering || (needsUrl && !profileUrl.trim())}
        className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground px-4 py-2 rounded-lg hover:bg-secondary/20 border border-border/8 transition-all tactile-press disabled:opacity-30"
      >
        {discovering ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Discovering posts…
          </>
        ) : (
          <>
            <Search className="w-3.5 h-3.5" />
            Discover Posts
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-primary/[0.03] border border-primary/8"
        >
          <CheckCircle2 className="w-4 h-4 text-primary/50 mt-0.5 shrink-0" />
          <div className="text-[11px] text-muted-foreground/60 leading-relaxed space-y-1">
            <p className="font-medium text-foreground/70">Discovery complete</p>
            <p>{result.discovered} posts found · {result.inserted} new · {result.duplicates} duplicates skipped</p>
          </div>
        </motion.div>
      )}

      {/* Error */}
      {error && !needsUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-destructive/[0.03] border border-destructive/10"
        >
          <AlertCircle className="w-4 h-4 text-destructive/50 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{error}</p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default PostDiscoveryPanel;
