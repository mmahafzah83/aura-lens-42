import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Link, Upload, Loader2, CheckCircle2, AlertCircle, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onIngestionComplete?: () => void;
}

interface PostForm {
  url: string;
  title: string;
  hook: string;
  topic_label: string;
  format_type: string;
  content_type: string;
}

const EMPTY_FORM: PostForm = { url: "", title: "", hook: "", topic_label: "", format_type: "", content_type: "" };

const FORMAT_OPTIONS = ["short-form", "long-form", "listicle", "narrative", "carousel", "video", "document"];
const CONTENT_OPTIONS = ["insight", "lesson", "framework", "opinion", "story", "advice", "announcement"];

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u.startsWith("http")) u = "https://" + u;
  try {
    const parsed = new URL(u);
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return u.split("?")[0].replace(/\/+$/, "");
  }
}

const ManualPostIngestion = ({ onIngestionComplete }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"single" | "bulk" | "csv" | null>(null);
  const [form, setForm] = useState<PostForm>(EMPTY_FORM);
  const [bulkUrls, setBulkUrls] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; duplicates: number; errors: string[] } | null>(null);

  const updateForm = (key: keyof PostForm, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const ingestSingle = async () => {
    if (!form.url.trim()) return;
    setIngesting(true);
    setResult(null);

    const url = normalizeUrl(form.url);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIngesting(false); return; }

    // Check duplicate
    const { data: existing } = await supabase
      .from("linkedin_posts")
      .select("id")
      .eq("post_url", url)
      .maybeSingle();

    if (existing) {
      // Update existing
      await supabase.from("linkedin_posts").update({
        ...(form.title && { title: form.title }),
        ...(form.hook && { hook: form.hook }),
        ...(form.topic_label && { topic_label: form.topic_label }),
        ...(form.format_type && { format_type: form.format_type }),
        ...(form.content_type && { content_type: form.content_type }),
      }).eq("id", existing.id);

      setResult({ inserted: 0, duplicates: 1, errors: [] });
      toast({ title: "Post updated", description: "Existing post metadata updated." });
    } else {
      const { error } = await supabase.from("linkedin_posts").insert({
        user_id: user.id,
        linkedin_post_id: url,
        post_url: url,
        title: form.title || null,
        hook: form.hook || null,
        topic_label: form.topic_label || null,
        format_type: form.format_type || null,
        content_type: form.content_type || null,
        media_type: "text",
        engagement_score: 0,
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
      });

      if (error) {
        setResult({ inserted: 0, duplicates: 0, errors: [error.message] });
      } else {
        setResult({ inserted: 1, duplicates: 0, errors: [] });
        toast({ title: "Post added", description: "Manual post ingested successfully." });
      }
    }

    setForm(EMPTY_FORM);
    setIngesting(false);
    onIngestionComplete?.();
  };

  const ingestBulk = async () => {
    const urls = bulkUrls.split("\n").map(l => l.trim()).filter(Boolean);
    if (urls.length === 0) return;
    setIngesting(true);
    setResult(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIngesting(false); return; }

    let inserted = 0, duplicates = 0;
    const errors: string[] = [];

    for (const raw of urls) {
      const url = normalizeUrl(raw);
      const { data: existing } = await supabase
        .from("linkedin_posts")
        .select("id")
        .eq("post_url", url)
        .maybeSingle();

      if (existing) { duplicates++; continue; }

      const { error } = await supabase.from("linkedin_posts").insert({
        user_id: user.id,
        linkedin_post_id: url,
        post_url: url,
        media_type: "text",
        engagement_score: 0,
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
      });

      if (error) {
        if (error.code === "23505") duplicates++;
        else errors.push(error.message);
      } else {
        inserted++;
      }
    }

    setResult({ inserted, duplicates, errors });
    toast({ title: "Bulk import done", description: `${inserted} added, ${duplicates} duplicates.` });
    setBulkUrls("");
    setIngesting(false);
    onIngestionComplete?.();
  };

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setResult(null);

    const text = await file.text();
    const lines = text.split("\n").slice(1).filter(l => l.trim());
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIngesting(false); return; }

    let inserted = 0, duplicates = 0;
    const errors: string[] = [];

    for (const line of lines) {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const rawUrl = cols[0];
      if (!rawUrl || !rawUrl.includes("linkedin")) continue;

      const url = normalizeUrl(rawUrl);
      const { data: existing } = await supabase
        .from("linkedin_posts")
        .select("id")
        .eq("post_url", url)
        .maybeSingle();

      if (existing) { duplicates++; continue; }

      const { error } = await supabase.from("linkedin_posts").insert({
        user_id: user.id,
        linkedin_post_id: url,
        post_url: url,
        title: cols[1] || null,
        hook: cols[2] || null,
        topic_label: cols[3] || null,
        format_type: cols[4] || null,
        content_type: cols[5] || null,
        media_type: "text",
        engagement_score: 0,
        like_count: 0,
        comment_count: 0,
        repost_count: 0,
      });

      if (error) {
        if (error.code === "23505") duplicates++;
        else errors.push(error.message);
      } else {
        inserted++;
      }
    }

    setResult({ inserted, duplicates, errors });
    toast({ title: "CSV import done", description: `${inserted} added, ${duplicates} duplicates.` });
    setIngesting(false);
    onIngestionComplete?.();
    if (fileRef.current) fileRef.current.value = "";
  };

  const selectClasses = "w-full px-3 py-2 rounded-lg bg-secondary/10 border border-border/10 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none";
  const inputClasses = "w-full px-3 py-2 rounded-lg bg-secondary/10 border border-border/10 text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:ring-1 focus:ring-primary/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-card rounded-2xl card-pad border border-border/8 space-y-4"
    >
      <div className="flex items-center gap-3">
        <Plus className="w-4 h-4 text-muted-foreground/30" />
        <div>
          <h3 className="text-sm font-semibold text-foreground/70">Missing a post?</h3>
          <p className="text-meta mt-0.5">
            If a recent LinkedIn post has not appeared yet, you can add it manually while Aura continues automatic discovery retries.
          </p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        {([
          { key: "single" as const, icon: Link, label: "Single URL" },
          { key: "bulk" as const, icon: FileText, label: "Bulk URLs" },
          { key: "csv" as const, icon: Upload, label: "CSV Upload" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(mode === key ? null : key)}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all tactile-press ${
              mode === key
                ? "text-primary border-primary/20 bg-primary/5"
                : "text-muted-foreground/50 border-border/8 hover:bg-secondary/10"
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Single URL mode */}
        {mode === "single" && (
          <motion.div
            key="single"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <input
              type="url"
              value={form.url}
              onChange={e => updateForm("url", e.target.value)}
              placeholder="https://www.linkedin.com/posts/..."
              className={inputClasses}
            />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.title} onChange={e => updateForm("title", e.target.value)} placeholder="Title (optional)" className={inputClasses} />
              <input value={form.hook} onChange={e => updateForm("hook", e.target.value)} placeholder="Hook (optional)" className={inputClasses} />
              <input value={form.topic_label} onChange={e => updateForm("topic_label", e.target.value)} placeholder="Topic label (optional)" className={inputClasses} />
              <select value={form.format_type} onChange={e => updateForm("format_type", e.target.value)} className={selectClasses}>
                <option value="">Format type…</option>
                {FORMAT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={form.content_type} onChange={e => updateForm("content_type", e.target.value)} className={selectClasses}>
                <option value="">Content type…</option>
                {CONTENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <button
              onClick={ingestSingle}
              disabled={ingesting || !form.url.trim()}
              className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg hover:bg-primary/5 border border-primary/10 transition-all tactile-press disabled:opacity-30"
            >
              {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {ingesting ? "Adding…" : "Add Post"}
            </button>
          </motion.div>
        )}

        {/* Bulk URLs mode */}
        {mode === "bulk" && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <textarea
              value={bulkUrls}
              onChange={e => setBulkUrls(e.target.value)}
              placeholder="Paste one LinkedIn post URL per line…"
              rows={5}
              className={`${inputClasses} resize-none`}
            />
            <button
              onClick={ingestBulk}
              disabled={ingesting || !bulkUrls.trim()}
              className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg hover:bg-primary/5 border border-primary/10 transition-all tactile-press disabled:opacity-30"
            >
              {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {ingesting ? "Importing…" : `Import ${bulkUrls.split("\n").filter(l => l.trim()).length} URLs`}
            </button>
          </motion.div>
        )}

        {/* CSV mode */}
        {mode === "csv" && (
          <motion.div
            key="csv"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <p className="text-[10px] text-muted-foreground/40">
              CSV format: <code className="text-primary/40">post_url, title, hook, topic_label, format_type, content_type</code>
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

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-primary/[0.03] border border-primary/8"
        >
          <CheckCircle2 className="w-4 h-4 text-primary/50 mt-0.5 shrink-0" />
          <div className="text-[11px] text-muted-foreground/50 space-y-0.5">
            <p>{result.inserted} post{result.inserted !== 1 ? "s" : ""} added · {result.duplicates} duplicate{result.duplicates !== 1 ? "s" : ""} skipped</p>
            {result.errors.length > 0 && (
              <p className="text-destructive/40">{result.errors.length} error{result.errors.length !== 1 ? "s" : ""}: {result.errors[0]}</p>
            )}
          </div>
          <button onClick={() => setResult(null)} className="ml-auto text-muted-foreground/20 hover:text-muted-foreground/50">
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ManualPostIngestion;
