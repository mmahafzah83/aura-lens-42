import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, CheckCircle2, AlertCircle, Globe, Sparkles, Tag, Filter, ShieldX, Clock, Timer, CalendarClock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatSmartDate } from "@/lib/formatDate";

interface Props {
  onDiscoveryComplete?: () => void;
}

interface RejectionReasons {
  profile_page?: number;
  article_reference?: number;
  comment_thread?: number;
  external_reference?: number;
  mention_by_other?: number;
  invalid_url_pattern?: number;
  failed_authorship?: number;
  authorship_uncertain?: number;
}

interface DiscoveryResult {
  profile_url?: string;
  queries_run?: number;
  total_results?: number;
  raw_links_found?: number;
  valid_posts?: number;
  discovered: number;
  inserted: number;
  confirmed?: number;
  duplicates: number;
  uncertain_held?: number;
  rejected_count?: number;
  rejection_reasons?: RejectionReasons;
  classified?: number;
  labels?: string[];
  source_type?: string;
  errors?: string[];
  mode?: string;
  blocked_queries?: number;
  candidates_confirmed?: number;
}

interface SyncRun {
  completed_at: string;
  records_fetched: number;
  records_stored: number;
  status: string;
  sync_type: string;
  error_message: string | null;
}

const PostDiscoveryPanel = ({ onDiscoveryComplete }: Props) => {
  const { toast } = useToast();
  const [discovering, setDiscovering] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [needsUrl, setNeedsUrl] = useState(true);
  const [recentRuns, setRecentRuns] = useState<SyncRun[]>([]);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [classifyResult, setClassifyResult] = useState<{ classified: number; labels: string[] } | null>(null);

  useEffect(() => {
    loadRecentRuns();
    loadUnclassifiedCount();
  }, []);

  const loadRecentRuns = async () => {
    const { data } = await supabase
      .from("sync_runs")
      .select("completed_at, records_fetched, records_stored, status, sync_type, error_message")
      .in("sync_type", ["discovery", "search_discovery", "retry_discovery"])
      .order("completed_at", { ascending: false })
      .limit(5);
    if (data) setRecentRuns(data as SyncRun[]);
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
          raw_links_found: data.raw_links_found,
          valid_posts: data.valid_posts,
          discovered: data.discovered,
          inserted: data.inserted,
          confirmed: data.confirmed,
          duplicates: data.duplicates,
          uncertain_held: data.uncertain_held,
          rejected_count: data.rejected_count,
          rejection_reasons: data.rejection_reasons,
          classified: data.classified,
          labels: data.labels,
          source_type: data.source_type,
          errors: data.errors,
          mode: data.mode,
          blocked_queries: data.blocked_queries,
          candidates_confirmed: data.candidates_confirmed,
        });
        const classifiedMsg = data.classified > 0 ? `, ${data.classified} classified` : "";
        toast({
          title: "Posts discovered",
          description: `${data.inserted} new posts added, ${data.duplicates} duplicates skipped${classifiedMsg}.`,
        });
        onDiscoveryComplete?.();
        await loadRecentRuns();
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

  const lastRun = recentRuns[0] || null;

  const syncTypeLabel = (t: string) => {
    if (t === "retry_discovery") return "Retry";
    if (t === "search_discovery") return "Search";
    return "Discovery";
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
              Automated search-based discovery with retry scheduling
            </p>
          </div>
        </div>
        {lastRun && (
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground/30">
              Last: {formatSmartDate(lastRun.completed_at)} · {syncTypeLabel(lastRun.sync_type)}
              {lastRun.status === "failed" && " · failed"}
            </p>
            {lastRun.records_stored > 0 && (
              <p className="text-[9px] text-primary/40 mt-0.5">
                {lastRun.records_stored} new post{lastRun.records_stored !== 1 ? "s" : ""} found
              </p>
            )}
          </div>
        )}
      </div>

      {/* Schedule status */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
          <Timer className="w-3 h-3 text-primary/30" />
          <span>Retry: every 6h</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
          <CalendarClock className="w-3 h-3 text-primary/30" />
          <span>Full scan: daily 6 AM UTC</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
          <RefreshCw className="w-3 h-3 text-primary/30" />
          <span>7-day retry window</span>
        </div>
      </div>

      {/* Profile URL input */}
      {needsUrl && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground/50">
            Enter your LinkedIn profile URL. Once set, discovery runs automatically.
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
              Searching…
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" />
              Discover Now
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

      {/* Recent runs log */}
      {recentRuns.length > 1 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground/30 font-medium">Recent runs</p>
          <div className="space-y-0.5">
            {recentRuns.slice(0, 5).map((run, i) => (
              <div key={i} className="flex items-center gap-3 text-[9px] text-muted-foreground/40">
                <span className="w-14 shrink-0">{formatSmartDate(run.completed_at)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                  run.sync_type === "retry_discovery" 
                    ? "bg-amber-500/5 text-amber-500/50" 
                    : "bg-primary/5 text-primary/50"
                }`}>
                  {syncTypeLabel(run.sync_type)}
                </span>
                <span>{run.records_stored} new</span>
                <span className="text-muted-foreground/25">{run.records_fetched} scanned</span>
                {run.status === "failed" && (
                  <span className="text-destructive/40">failed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
          {(result.raw_links_found ?? 0) > 0 && (
            <div className="flex items-center flex-wrap gap-3 pl-6 text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground/40">
                <Filter className="w-3 h-3" />
                {result.raw_links_found} links scanned
              </span>
              <span className="text-primary/50 font-medium">{result.valid_posts ?? result.discovered} authored (2+ signals)</span>
              {(result.uncertain_held ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-amber-500/60">
                  <Clock className="w-3 h-3" />
                  {result.uncertain_held} held for review
                </span>
              )}
              {(result.rejected_count ?? 0) > 0 && (
                <span className="text-destructive/40">{result.rejected_count} rejected</span>
              )}
              {(result.blocked_queries ?? 0) > 0 && (
                <span className="text-amber-500/40">{result.blocked_queries} blocked</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-muted-foreground/50 pl-6">
            {result.profile_url && (
              <p><span className="text-muted-foreground/30">Profile:</span> {result.profile_url.replace("https://www.linkedin.com/in/", "")}</p>
            )}
            {result.queries_run != null && (
              <p><span className="text-muted-foreground/30">Queries run:</span> {result.queries_run}</p>
            )}
            <p><span className="text-muted-foreground/30">Authored posts:</span> {result.valid_posts ?? result.discovered}</p>
            <p><span className="text-muted-foreground/30">New inserted:</span> {result.inserted}</p>
            {(result.confirmed ?? 0) > 0 && (
              <p><span className="text-primary/40">Confirmed:</span> {result.confirmed}</p>
            )}
            <p><span className="text-muted-foreground/30">Duplicates:</span> {result.duplicates}</p>
            {(result.candidates_confirmed ?? 0) > 0 && (
              <p><span className="text-primary/40">Review → confirmed:</span> {result.candidates_confirmed}</p>
            )}
            {(result.uncertain_held ?? 0) > 0 && (
              <p><span className="text-amber-500/40">Review queue:</span> {result.uncertain_held}</p>
            )}
            <p><span className="text-muted-foreground/30">Errors:</span> {result.errors?.length || 0}</p>
            {(result.classified ?? 0) > 0 && (
              <p><span className="text-muted-foreground/30">Classified:</span> {result.classified}</p>
            )}
          </div>

          {/* Rejection breakdown */}
          {result.rejection_reasons && (result.rejected_count ?? 0) > 0 && (
            <div className="pl-6 space-y-1 mt-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/35">
                <ShieldX className="w-3 h-3" />
                <span className="font-medium">Rejection reasons</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-4">
                {Object.entries(result.rejection_reasons)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => (
                    <span
                      key={reason}
                      className="px-2 py-0.5 rounded-full bg-destructive/5 text-[9px] text-destructive/40 border border-destructive/8"
                    >
                      {reason.replace(/_/g, " ")} ({count})
                    </span>
                  ))}
              </div>
            </div>
          )}
          {result.labels && result.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-6 mt-1">
              {[...new Set(result.labels)].map((label, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-primary/5 text-[9px] text-primary/60 border border-primary/8"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
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
