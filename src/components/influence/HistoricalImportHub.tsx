import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Upload, Plus, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatSmartDate } from "@/lib/formatDate";

const HistoricalImportHub = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [manualDate, setManualDate] = useState("");
  const [manualFollowers, setManualFollowers] = useState("");
  const [manualImpressions, setManualImpressions] = useState("");
  const [manualReactions, setManualReactions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = async () => {
    try {
      const { data } = await supabase
        .from("import_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      setJobs(data || []);
    } catch { /* silent */ }
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

      const { data: job } = await supabase
        .from("import_jobs")
        .insert({ user_id: session.user.id, import_type: "csv", filename: file.name, status: "processing", total_rows: lines.length - 1, started_at: new Date().toISOString() })
        .select().single();

      let imported = 0, skipped = 0, duplicates = 0;
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
          user_id: session.user.id, snapshot_date: snapshotDate,
          followers: followersIdx >= 0 ? parseInt(cols[followersIdx]) || 0 : 0,
          impressions: impressionsIdx >= 0 ? parseInt(cols[impressionsIdx]) || 0 : 0,
          reactions: reactionsIdx >= 0 ? parseInt(cols[reactionsIdx]) || 0 : 0,
          comments: commentsIdx >= 0 ? parseInt(cols[commentsIdx]) || 0 : 0,
          shares: sharesIdx >= 0 ? parseInt(cols[sharesIdx]) || 0 : 0,
          source_type: "csv_import",
        });
        if (error) { error.code === "23505" ? duplicates++ : skipped++; } else { imported++; }
      }

      if (job) {
        await supabase.from("import_jobs").update({ status: "completed", imported_rows: imported, skipped_rows: skipped, duplicate_rows: duplicates, completed_at: new Date().toISOString() }).eq("id", job.id);
      }
      await loadJobs();
    } catch { /* silent */ }
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
        user_id: session.user.id, snapshot_date: manualDate,
        followers: parseInt(manualFollowers) || 0,
        impressions: parseInt(manualImpressions) || 0,
        reactions: parseInt(manualReactions) || 0,
        source_type: "manual",
      });
      await supabase.from("import_jobs").insert({
        user_id: session.user.id, import_type: "manual", status: "completed",
        total_rows: 1, imported_rows: 1,
        started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      });
      setManualDate(""); setManualFollowers(""); setManualImpressions(""); setManualReactions("");
      setManualOpen(false);
      await loadJobs();
    } catch { /* silent */ }
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.06 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-5"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Historical Import</h3>
        <p className="text-meta mt-0.5">Preserve past authority data from CSV or manual entry. Duplicates are detected and skipped.</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground px-4 py-2.5 rounded-lg hover:bg-secondary/20 border border-border/8 transition-all cursor-pointer tactile-press">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload CSV
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} disabled={uploading} />
        </label>
        <button
          onClick={() => setManualOpen(true)}
          className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/60 hover:text-foreground px-4 py-2.5 rounded-lg hover:bg-secondary/20 border border-border/8 transition-all tactile-press"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Manually
        </button>
      </div>

      {/* Import log — minimal */}
      {jobs.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/5">
          {jobs.map((job: any) => (
            <div key={job.id} className="flex items-center justify-between py-1.5">
              <p className="text-[11px] text-muted-foreground/50">
                {job.filename || "Manual entry"} · {formatSmartDate(job.created_at)}
              </p>
              <p className="text-[11px] text-muted-foreground/40 tabular-nums">
                {job.imported_rows} imported{job.duplicate_rows > 0 ? ` · ${job.duplicate_rows} skipped` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="glass-card-elevated border-border/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Add a snapshot</DialogTitle>
          </DialogHeader>
          <p className="text-meta -mt-1">Record a single day's metrics manually.</p>
          <div className="space-y-4 mt-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground/60 mb-1.5 block">Date</label>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground/60 mb-1.5 block">Followers</label>
                <Input type="number" placeholder="—" value={manualFollowers} onChange={(e) => setManualFollowers(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground/60 mb-1.5 block">Impressions</label>
                <Input type="number" placeholder="—" value={manualImpressions} onChange={(e) => setManualImpressions(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground/60 mb-1.5 block">Reactions</label>
                <Input type="number" placeholder="—" value={manualReactions} onChange={(e) => setManualReactions(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleManualEntry} disabled={!manualDate || submitting} className="w-full" variant="outline">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default HistoricalImportHub;
