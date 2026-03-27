import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, CheckCircle2, AlertCircle, Globe, Sparkles, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatSmartDate } from "@/lib/formatDate";

interface Props {
  onDiscoveryComplete?: () => void;
}

interface DiscoveryResult {
  profile_url?: string;
  queries_run?: number;
  total_results?: number;
  discovered: number;
  inserted: number;
  duplicates: number;
  source_type?: string;
  errors?: string[];
}

const PostDiscoveryPanel = ({ onDiscoveryComplete }: Props) => {
  const { toast } = useToast();
  const [discovering, setDiscovering] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [needsUrl, setNeedsUrl] = useState(true);
  const [lastRun, setLastRun] = useState<any>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [classifyResult, setClassifyResult] = useState<{ classified: number; labels: string[] } | null>(null);

  useEffect(() => {
    loadLastRun();
    loadUnclassifiedCount();
  }, []);

  const loadLastRun = async () => {
    const { data } = await supabase
      .from("sync_runs")
      .select("completed_at, records_fetched, records_stored, status, error_message")
      .eq("sync_type", "discovery")
      .order("completed_at", { ascending: false })
      .limit(1);
    if (data?.[0]) setLastRun(data[0]);
  };

  const loadUnclassifiedCount = async () => {
    const { count } = await supabase
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .is("topic_label", null)
      .not("post_text", "is", null);
    setUnclassifiedCount(count || 0);
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
          profile_url: data.profile_url,
          queries_run: data.queries_run,
          total_results: data.total_results,
          discovered: data.discovered,
          inserted: data.inserted,
          duplicates: data.duplicates,
          source_type: data.source_type,
          errors: data.errors,
        });
        toast({
          title: "Posts discovered",
          description: `${data.inserted} new posts added, ${data.duplicates} duplicates skipped.`,
        });
        onDiscoveryComplete?.();
        await loadLastRun();
        await loadUnclassifiedCount();
      }
    } catch (e: any) {
      setError(e.message || "Unexpected error");
    }
    setDiscovering(false);
  };

  const handleClassify = async () => {
    setClassifying(true);
    setClassifyResult(null);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("classify-posts");

      if (fnErr) {
        setError(fnErr.message || "Classification failed");
        toast({ title: "Classification failed", description: fnErr.message, variant: "destructive" });
      } else if (!data?.success) {
        setError(data?.error || "Classification failed");
      } else {
        setClassifyResult({ classified: data.classified, labels: data.labels || [] });
        toast({
          title: "Posts classified",
          description: `${data.classified} posts labeled with AI.`,
        });
        await loadUnclassifiedCount();
        onDiscoveryComplete?.();
      }
    } catch (e: any) {
      setError(e.message || "Unexpected error");
    }
    setClassifying(false);
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
              Crawl your LinkedIn activity pages to discover and store published posts
            </p>
          </div>
        </div>
        {lastRun && (
          <p className="text-[10px] text-muted-foreground/30">
            Last run: {formatSmartDate(lastRun.completed_at)} · {lastRun.records_stored || 0} stored
            {lastRun.status === "failed" && " · failed"}
          </p>
        )}
      </div>

      {/* Profile URL input */}
      {needsUrl && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground/50">
            Enter your LinkedIn profile URL to crawl activity pages.
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

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleDiscover}
          disabled={discovering || (needsUrl && !profileUrl.trim())}
          className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground px-4 py-2 rounded-lg hover:bg-secondary/20 border border-border/8 transition-all tactile-press disabled:opacity-30"
        >
          {discovering ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Crawling activity pages…
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" />
              Discover Posts
            </>
          )}
        </button>

        {unclassifiedCount > 0 && (
          <button
            onClick={handleClassify}
            disabled={classifying}
            className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg hover:bg-primary/5 border border-primary/10 transition-all tactile-press disabled:opacity-30"
          >
            {classifying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Classifying…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Classify {unclassifiedCount} post{unclassifiedCount !== 1 ? "s" : ""}
              </>
            )}
          </button>
        )}
      </div>

      {/* Classification result */}
      {classifyResult && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg bg-primary/[0.03] border border-primary/8 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary/50 shrink-0" />
            <p className="text-[11px] font-medium text-foreground/70">
              {classifyResult.classified} posts classified
            </p>
          </div>
          {classifyResult.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {[...new Set(classifyResult.labels)].map((label, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-primary/5 text-[9px] text-primary/60 border border-primary/8"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Discovery summary */}
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg bg-primary/[0.03] border border-primary/8 space-y-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary/50 shrink-0" />
            <p className="text-[11px] font-medium text-foreground/70">Discovery complete</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-muted-foreground/50 pl-6">
            {result.profile_url && (
              <p><span className="text-muted-foreground/30">Profile:</span> {result.profile_url.replace("https://www.linkedin.com/in/", "")}</p>
            )}
            {result.pages_visited != null && (
              <p><span className="text-muted-foreground/30">Pages visited:</span> {result.pages_visited}</p>
            )}
            <p><span className="text-muted-foreground/30">Posts found:</span> {result.discovered}</p>
            <p><span className="text-muted-foreground/30">New inserted:</span> {result.inserted}</p>
            <p><span className="text-muted-foreground/30">Duplicates:</span> {result.duplicates}</p>
            <p><span className="text-muted-foreground/30">Errors:</span> {result.errors?.length || 0}</p>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="pl-6 space-y-0.5">
              {result.errors.map((e, i) => (
                <p key={i} className="text-[9px] text-destructive/40 truncate">{e}</p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Error */}
      {error && (
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
