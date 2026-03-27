import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Loader2, CheckCircle2, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onCleanupComplete?: () => void;
}

interface CleanupResult {
  total: number;
  kept: number;
  rejected: number;
  reasons: Record<string, number>;
}

const REASON_LABELS: Record<string, string> = {
  not_authored_by_user: "Not authored by you",
  profile_page: "Profile page link",
  mention_only: "Mention by another user",
  comment_only: "Comment thread",
  external_reference: "External / company reference",
  unsupported_url: "Unsupported URL pattern",
};

const PostCleanupPanel = ({ onCleanupComplete }: Props) => {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const handleCleanup = async () => {
    setRunning(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("cleanup-posts");

      if (error) {
        toast({ title: "Cleanup failed", description: error.message, variant: "destructive" });
      } else if (!data?.success) {
        toast({ title: "Cleanup failed", description: data?.error || "Unknown error", variant: "destructive" });
      } else {
        setResult(data as CleanupResult);
        toast({
          title: "Cleanup complete",
          description: `${data.kept} authored posts kept, ${data.rejected} rejected.`,
        });
        onCleanupComplete?.();
      }
    } catch (e: any) {
      toast({ title: "Cleanup failed", description: e.message, variant: "destructive" });
    }
    setRunning(false);
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
          <ShieldX className="w-4 h-4 text-destructive/40" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Post Cleanup</h3>
            <p className="text-meta mt-0.5">
              Validate existing records and hide non-authored posts from analytics
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleCleanup}
        disabled={running}
        className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground px-4 py-2 rounded-lg hover:bg-secondary/20 border border-border/8 transition-all tactile-press disabled:opacity-30"
      >
        {running ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Validating records…
          </>
        ) : (
          <>
            <Trash2 className="w-3.5 h-3.5" />
            Run Cleanup
          </>
        )}
      </button>

      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg bg-primary/[0.03] border border-primary/8 space-y-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary/50 shrink-0" />
            <p className="text-[11px] font-medium text-foreground/70">Cleanup complete</p>
          </div>

          <div className="grid grid-cols-3 gap-4 pl-6">
            <div className="space-y-0.5">
              <p className="text-lg font-bold tabular-nums text-foreground">{result.total}</p>
              <p className="text-[10px] text-muted-foreground/35">Total records</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-lg font-bold tabular-nums text-primary/70">{result.kept}</p>
              <p className="text-[10px] text-muted-foreground/35">Authored (kept)</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-lg font-bold tabular-nums text-destructive/50">{result.rejected}</p>
              <p className="text-[10px] text-muted-foreground/35">Rejected (hidden)</p>
            </div>
          </div>

          {result.rejected > 0 && Object.keys(result.reasons).length > 0 && (
            <div className="pl-6 space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground/35">Rejection reasons</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.reasons)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => (
                    <span
                      key={reason}
                      className="px-2 py-0.5 rounded-full bg-destructive/5 text-[9px] text-destructive/40 border border-destructive/8"
                    >
                      {REASON_LABELS[reason] || reason.replace(/_/g, " ")} ({count})
                    </span>
                  ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default PostCleanupPanel;
