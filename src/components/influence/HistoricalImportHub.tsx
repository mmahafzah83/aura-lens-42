import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, Plus, CheckCircle2, AlertTriangle, Loader2, X, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatSmartDate } from "@/lib/formatDate";

interface ImportJob {
  id: string;
  import_type: string;
  filename: string | null;
  status: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  created_at: string;
}

const HistoricalImportHub = () => {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Manual entry state
  const [manualDate, setManualDate] = useState("");
  const [manualFollowers, setManualFollowers] = useState("");
  const [manualImpressions, setManualImpressions] = useState("");
  const [manualReactions, setManualReactions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const { data } = await supabase
        .from("import_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      setJobs((data as ImportJob[]) || []);
    } catch {
      // silent
    }
    setLoading(false);
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const text = await file.text();
      const lines = text.trim().split("\n");
      const headers = lines[0].toLowerCase().split(",").map(h => h.trim());

      // Create import job
      const { data: job } = await supabase
        .from("import_jobs")
        .insert({
          user_id: session.user.id,
          import_type: "csv",
          filename: file.name,
          status: "processing",
          total_rows: lines.length - 1,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      let imported = 0;
      let skipped = 0;
      let duplicates = 0;

      const dateIdx = headers.findIndex(h => h.includes("date"));
      const followersIdx = headers.findIndex(h => h.includes("follower"));
      const impressionsIdx = headers.findIndex(h => h.includes("impression"));
      const reactionsIdx = headers.findIndex(h => h.includes("reaction") || h.includes("like"));
      const commentsIdx = headers.findIndex(h => h.includes("comment"));
      const sharesIdx = headers.findIndex(h => h.includes("share") || h.includes("repost"));

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim());
        const snapshotDate = dateIdx >= 0 ? cols[dateIdx] : null;
        if (!snapshotDate) { skipped++; continue; }

        const { error } = await supabase.from("influence_snapshots").insert({
          user_id: session.user.id,
          snapshot_date: snapshotDate,
          followers: followersIdx >= 0 ? parseInt(cols[followersIdx]) || 0 : 0,
          impressions: impressionsIdx >= 0 ? parseInt(cols[impressionsIdx]) || 0 : 0,
          reactions: reactionsIdx >= 0 ? parseInt(cols[reactionsIdx]) || 0 : 0,
          comments: commentsIdx >= 0 ? parseInt(cols[commentsIdx]) || 0 : 0,
          shares: sharesIdx >= 0 ? parseInt(cols[sharesIdx]) || 0 : 0,
          source_type: "csv_import",
        });

        if (error) {
          if (error.message?.includes("duplicate") || error.code === "23505") {
            duplicates++;
          } else {
            skipped++;
          }
        } else {
          imported++;
        }
      }

      if (job) {
        await supabase
          .from("import_jobs")
          .update({
            status: "completed",
            imported_rows: imported,
            skipped_rows: skipped,
            duplicate_rows: duplicates,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }

      await loadJobs();
    } catch {
      // silent
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleManualEntry = async () => {
    if (!manualDate) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from("influence_snapshots").insert({
        user_id: session.user.id,
        snapshot_date: manualDate,
        followers: parseInt(manualFollowers) || 0,
        impressions: parseInt(manualImpressions) || 0,
        reactions: parseInt(manualReactions) || 0,
        source_type: "manual",
      });

      await supabase.from("import_jobs").insert({
        user_id: session.user.id,
        import_type: "manual",
        status: "completed",
        total_rows: 1,
        imported_rows: 1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      setManualDate("");
      setManualFollowers("");
      setManualImpressions("");
      setManualReactions("");
      setManualOpen(false);
      await loadJobs();
    } catch {
      // silent
    }
    setSubmitting(false);
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === "processing") return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
    return <AlertTriangle className="w-4 h-4 text-red-400" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-card-title text-foreground">Historical Import Hub</h3>
            <p className="text-meta">Preserve your authority history from CSV or manual entry</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-primary/70 hover:text-primary px-4 py-2.5 rounded-lg bg-primary/6 hover:bg-primary/12 border border-primary/8 transition-all cursor-pointer tactile-press">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          Upload CSV
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} disabled={uploading} />
        </label>
        <button
          onClick={() => setManualOpen(true)}
          className="flex items-center gap-2 text-xs font-medium text-foreground/70 hover:text-foreground px-4 py-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 border border-border/10 transition-all tactile-press"
        >
          <Plus className="w-3.5 h-3.5" />
          Manual Entry
        </button>
      </div>

      {/* CSV format hint */}
      <div className="p-3 rounded-lg bg-secondary/10 border border-border/5">
        <p className="text-meta leading-relaxed">
          CSV format: <code className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/30 text-foreground/70 font-mono">date, followers, impressions, reactions, comments, shares</code>
        </p>
        <p className="text-meta mt-1">Duplicates are detected by date and skipped automatically.</p>
      </div>

      {/* Import history */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <p className="text-label uppercase tracking-widest text-xs font-semibold">Import History</p>
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/10 border border-border/5">
              <div className="flex items-center gap-3 min-w-0">
                {statusIcon(job.status)}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {job.filename || `Manual entry`}
                  </p>
                  <p className="text-meta">{formatSmartDate(job.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs tabular-nums text-foreground/70">{job.imported_rows}/{job.total_rows}</span>
                {job.duplicate_rows > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/15">
                    {job.duplicate_rows} dupes
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual entry dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="glass-card-elevated border-border/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Manual Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-xs font-medium text-foreground/70 mb-1.5 block">Date *</label>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground/70 mb-1.5 block">Followers</label>
                <Input type="number" placeholder="0" value={manualFollowers} onChange={(e) => setManualFollowers(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/70 mb-1.5 block">Impressions</label>
                <Input type="number" placeholder="0" value={manualImpressions} onChange={(e) => setManualImpressions(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground/70 mb-1.5 block">Reactions</label>
                <Input type="number" placeholder="0" value={manualReactions} onChange={(e) => setManualReactions(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleManualEntry} disabled={!manualDate || submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
              Save Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default HistoricalImportHub;
