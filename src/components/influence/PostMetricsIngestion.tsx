import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Plus, Upload, Loader2, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onComplete?: () => void;
}

interface MetricsForm {
  postId: string;
  impressions: string;
  reactions: string;
  comments: string;
  shares: string;
  saves: string;
  engagementRate: string;
}

const EMPTY: MetricsForm = { postId: "", impressions: "", reactions: "", comments: "", shares: "", saves: "", engagementRate: "" };

const PostMetricsIngestion = ({ onComplete }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"manual" | "csv" | null>(null);
  const [form, setForm] = useState<MetricsForm>(EMPTY);
  const [posts, setPosts] = useState<{ id: string; label: string }[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: string[] } | null>(null);

  const loadPosts = async () => {
    const { data } = await supabase
      .from("linkedin_posts")
      .select("id, hook, title, post_text, published_at")
      .order("published_at", { ascending: false })
      .limit(200);
    setPosts((data || []).map(p => ({
      id: p.id,
      label: (p.hook || p.title || p.post_text?.slice(0, 60) || "Untitled") +
        (p.published_at ? ` (${new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""),
    })));
  };

  const openMode = (m: "manual" | "csv") => {
    setMode(mode === m ? null : m);
    if (m === "manual" && posts.length === 0) loadPosts();
  };

  const update = (k: keyof MetricsForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const submitManual = async () => {
    if (!form.postId) return;
    setIngesting(true);
    setResult(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIngesting(false); return; }

    const { error } = await supabase.from("linkedin_post_metrics").insert({
      post_id: form.postId,
      user_id: user.id,
      impressions: parseInt(form.impressions) || 0,
      reactions: parseInt(form.reactions) || 0,
      comments: parseInt(form.comments) || 0,
      shares: parseInt(form.shares) || 0,
      saves: parseInt(form.saves) || 0,
      engagement_rate: parseFloat(form.engagementRate) || 0,
      source_type: "manual",
    } as any);

    if (error) {
      setResult({ inserted: 0, errors: [error.message] });
    } else {
      // Update tracking status
      await supabase.from("linkedin_posts")
        .update({ tracking_status: "metrics_imported" } as any)
        .eq("id", form.postId);
      setResult({ inserted: 1, errors: [] });
      toast({ title: "Metrics added", description: "Post metrics recorded." });
    }
    setForm(EMPTY);
    setIngesting(false);
    onComplete?.();
  };

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setResult(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIngesting(false); return; }

    const text = await file.text();
    const lines = text.split("\n").slice(1).filter(l => l.trim());

    let inserted = 0;
    const errors: string[] = [];

    for (const line of lines) {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const postUrl = cols[0];
      if (!postUrl) continue;

      // Find post by URL
      const { data: post } = await supabase
        .from("linkedin_posts")
        .select("id")
        .eq("post_url", postUrl)
        .maybeSingle();

      if (!post) {
        errors.push(`Post not found: ${postUrl.slice(0, 60)}`);
        continue;
      }

      const { error } = await supabase.from("linkedin_post_metrics").insert({
        post_id: post.id,
        user_id: user.id,
        impressions: parseInt(cols[1]) || 0,
        reactions: parseInt(cols[2]) || 0,
        comments: parseInt(cols[3]) || 0,
        shares: parseInt(cols[4]) || 0,
        saves: parseInt(cols[5]) || 0,
        engagement_rate: parseFloat(cols[6]) || 0,
        source_type: "csv_import",
      } as any);

      if (error) {
        errors.push(error.message);
      } else {
        await supabase.from("linkedin_posts")
          .update({ tracking_status: "metrics_imported" } as any)
          .eq("id", post.id);
        inserted++;
      }
    }

    setResult({ inserted, errors });
    toast({ title: "CSV metrics imported", description: `${inserted} metric snapshots added.` });
    setIngesting(false);
    onComplete?.();
    if (fileRef.current) fileRef.current.value = "";
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary/10 border border-border/10 text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:ring-1 focus:ring-primary/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-4"
    >
      <div className="flex items-center gap-3">
        <BarChart3 className="w-4 h-4 text-primary/40" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Post Metrics</h3>
          <p className="text-meta mt-0.5">
            Add performance metrics to discovered posts. Metrics are never fabricated — add real data only.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => openMode("manual")}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all tactile-press ${
            mode === "manual" ? "text-primary border-primary/20 bg-primary/5" : "text-muted-foreground/50 border-border/8 hover:bg-secondary/10"
          }`}
        >
          <Plus className="w-3 h-3" /> Manual Entry
        </button>
        <button
          onClick={() => openMode("csv")}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all tactile-press ${
            mode === "csv" ? "text-primary border-primary/20 bg-primary/5" : "text-muted-foreground/50 border-border/8 hover:bg-secondary/10"
          }`}
        >
          <Upload className="w-3 h-3" /> CSV Import
        </button>
      </div>

      <AnimatePresence mode="wait">
        {mode === "manual" && (
          <motion.div key="manual" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
            <select value={form.postId} onChange={e => update("postId", e.target.value)} className={`${inputCls} appearance-none`}>
              <option value="">Select a post…</option>
              {posts.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={form.impressions} onChange={e => update("impressions", e.target.value)} placeholder="Impressions" className={inputCls} />
              <input type="number" value={form.reactions} onChange={e => update("reactions", e.target.value)} placeholder="Reactions" className={inputCls} />
              <input type="number" value={form.comments} onChange={e => update("comments", e.target.value)} placeholder="Comments" className={inputCls} />
              <input type="number" value={form.shares} onChange={e => update("shares", e.target.value)} placeholder="Shares" className={inputCls} />
              <input type="number" value={form.saves} onChange={e => update("saves", e.target.value)} placeholder="Saves" className={inputCls} />
              <input type="number" step="0.1" value={form.engagementRate} onChange={e => update("engagementRate", e.target.value)} placeholder="Eng. rate %" className={inputCls} />
            </div>
            <button
              onClick={submitManual}
              disabled={ingesting || !form.postId}
              className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg hover:bg-primary/5 border border-primary/10 transition-all tactile-press disabled:opacity-30"
            >
              {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {ingesting ? "Saving…" : "Save Metrics"}
            </button>
          </motion.div>
        )}

        {mode === "csv" && (
          <motion.div key="csv" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
            <p className="text-[10px] text-muted-foreground/40">
              CSV format: <code className="text-primary/40">post_url, impressions, reactions, comments, shares, saves, engagement_rate</code>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleCsv}
              className="block w-full text-[11px] text-muted-foreground/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border/10 file:text-[11px] file:font-medium file:text-primary/60 file:bg-primary/5 file:cursor-pointer"
            />
            {ingesting && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/40">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing CSV…
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3 p-3 rounded-lg bg-primary/[0.03] border border-primary/8">
          <CheckCircle2 className="w-4 h-4 text-primary/50 mt-0.5 shrink-0" />
          <div className="text-[11px] text-muted-foreground/50 space-y-0.5">
            <p>{result.inserted} metric snapshot{result.inserted !== 1 ? "s" : ""} saved</p>
            {result.errors.length > 0 && result.errors.slice(0, 3).map((e, i) => (
              <p key={i} className="text-destructive/40 truncate">{e}</p>
            ))}
          </div>
          <button onClick={() => setResult(null)} className="ml-auto text-muted-foreground/20 hover:text-muted-foreground/50"><X className="w-3 h-3" /></button>
        </motion.div>
      )}
    </motion.div>
  );
};

export default PostMetricsIngestion;
