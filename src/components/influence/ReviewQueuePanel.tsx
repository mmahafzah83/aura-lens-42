import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardCheck, Loader2, CheckCircle2, XCircle, ExternalLink, Shield, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onReviewComplete?: () => void;
}

interface Candidate {
  id: string;
  candidate_url: string;
  snippet: string | null;
  confidence: number;
  rejection_reason: string;
  authorship_signals: string[];
  reviewed: boolean;
  created_at: string;
}

const ReviewQueuePanel = ({ onReviewComplete }: Props) => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadCandidates();
  }, []);

  const loadCandidates = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("discovery_review_queue" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("reviewed", false)
      .order("created_at", { ascending: false });

    setCandidates((data as any as Candidate[]) || []);
    setLoading(false);
  };

  const handleAction = async (candidate: Candidate, action: "approve" | "reject" | "external") => {
    setActing(candidate.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (action === "approve") {
        // Insert as active authored post
        const postId = candidate.candidate_url || `review-${candidate.id}`;
        await supabase.from("linkedin_posts").insert({
          user_id: user.id,
          linkedin_post_id: postId,
          post_url: candidate.candidate_url,
          post_text: candidate.snippet,
          hook: candidate.snippet?.split("\n")[0]?.slice(0, 200) || null,
          tracking_status: "discovered",
          engagement_score: 0,
          like_count: 0,
          comment_count: 0,
          repost_count: 0,
        });
      }

      if (action === "external") {
        // Insert as external_reference so it's excluded from analytics
        const postId = candidate.candidate_url || `review-${candidate.id}`;
        await supabase.from("linkedin_posts").insert({
          user_id: user.id,
          linkedin_post_id: postId,
          post_url: candidate.candidate_url,
          post_text: candidate.snippet,
          tracking_status: "rejected",
          rejection_reason: "external_reference",
          engagement_score: 0,
          like_count: 0,
          comment_count: 0,
          repost_count: 0,
        });
      }

      // Mark as reviewed
      await (supabase.from("discovery_review_queue" as any) as any)
        .update({ reviewed: true })
        .eq("id", candidate.id);

      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      const actionLabel = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Marked external";
      toast({ title: actionLabel, description: "Post review decision saved." });
      onReviewComplete?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setActing(null);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad border border-border/8 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
        <span className="text-meta">Loading review queue…</span>
      </div>
    );
  }

  if (candidates.length === 0) return null;

  const confidenceColor = (c: number) => {
    if (c >= 0.7) return "text-primary/60";
    if (c >= 0.4) return "text-amber-500/60";
    return "text-destructive/50";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl card-pad border border-amber-500/10 space-y-3"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-4 h-4 text-amber-500/50" />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">
              Discovery Review Queue
              <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/10 text-[10px] text-amber-500/70 font-medium">
                {candidates.length}
              </span>
            </h3>
            <p className="text-meta mt-0.5">
              Posts with uncertain authorship — review before they enter analytics
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/30" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/30" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-2 overflow-hidden"
          >
            {candidates.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-secondary/5 border border-border/8 space-y-2"
              >
                {/* URL + confidence */}
                <div className="flex items-start justify-between gap-3">
                  <a
                    href={c.candidate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary/50 hover:text-primary truncate max-w-[70%] flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {c.candidate_url.replace("https://www.linkedin.com", "")}
                  </a>
                  <div className="flex items-center gap-1.5">
                    <Shield className={`w-3 h-3 ${confidenceColor(c.confidence)}`} />
                    <span className={`text-[10px] font-medium ${confidenceColor(c.confidence)}`}>
                      {Math.round(c.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Snippet */}
                {c.snippet && (
                  <p className="text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-3">
                    {c.snippet}
                  </p>
                )}

                {/* Signals */}
                <div className="flex flex-wrap gap-1.5">
                  {(c.authorship_signals || []).map((signal, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full bg-primary/5 text-[9px] text-primary/50 border border-primary/8"
                    >
                      {signal.replace(/_/g, " ")}
                    </span>
                  ))}
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/5 text-[9px] text-amber-500/50 border border-amber-500/8">
                    {c.rejection_reason.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleAction(c, "approve")}
                    disabled={acting === c.id}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-primary/60 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 border border-primary/10 transition-all tactile-press disabled:opacity-30"
                  >
                    {acting === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Approve as my post
                  </button>
                  <button
                    onClick={() => handleAction(c, "reject")}
                    disabled={acting === c.id}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-destructive/50 hover:text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/5 border border-destructive/8 transition-all tactile-press disabled:opacity-30"
                  >
                    <XCircle className="w-3 h-3" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleAction(c, "external")}
                    disabled={acting === c.id}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/40 hover:text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-secondary/10 border border-border/8 transition-all tactile-press disabled:opacity-30"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    External ref
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ReviewQueuePanel;
