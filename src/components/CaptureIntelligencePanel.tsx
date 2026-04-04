import { useState, useRef, useEffect, useCallback } from "react";
import { Link, Mic, Type, FileUp, Loader2, Square, X, ArrowRight, ImageIcon, StickyNote, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Capture = Database["public"]["Tables"]["captures"]["Row"];
type InputMode = "link" | "voice" | "text" | "document";

interface CaptureIntelligencePanelProps {
  entries?: any[];
  onCaptured: () => void;
}

const INPUT_MODES: { key: InputMode; icon: typeof Link; label: string; placeholder: string }[] = [
  { key: "link", icon: Link, label: "Paste Link", placeholder: "Paste an article or report URL…" },
  { key: "voice", icon: Mic, label: "Voice Insight", placeholder: "Recording voice…" },
  { key: "text", icon: Type, label: "Quick Insight", placeholder: "Write a strategic thought or observation…" },
  { key: "document", icon: FileUp, label: "Upload Doc", placeholder: "Upload PDF, DOCX, or image" },
];

const TYPE_ICONS: Record<string, typeof Link> = {
  url: Link,
  link: Link,
  document: FileUp,
  voice: Mic,
  image: ImageIcon,
  note: StickyNote,
  text: Type,
};

function statusColor(status: string) {
  if (status === "completed") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (status === "pending") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-destructive/15 text-destructive border-destructive/20";
}

function captureTitle(c: Capture): string {
  if (c.type === "url" && c.source_url) return c.source_url;
  return (c.raw_content || c.extracted_text || "Untitled capture").slice(0, 60);
}

const CaptureIntelligencePanel = ({ onCaptured }: CaptureIntelligencePanelProps) => {
  const [mode, setMode] = useState<InputMode>("text");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCaptures = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from("captures")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setFetchError(error.message);
    } else {
      setCaptures(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  /* ── Voice Recording ── */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) return;
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, `recording.${mimeType.includes("webm") ? "webm" : "mp4"}`);
          const { data, error } = await supabase.functions.invoke("transcribe-voice", { body: formData });
          if (error || data?.error) {
            toast({ title: "Transcription failed", description: data?.error || error?.message, variant: "destructive" });
          } else if (data?.transcript) {
            setContent(data.transcript);
            toast({ title: "Transcribed", description: "Voice note ready. Save to capture." });
          }
        } catch {
          toast({ title: "Error", description: "Could not transcribe.", variant: "destructive" });
        }
        setIsTranscribing(false);
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone Error", description: "Could not access microphone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  /* ── Document Upload ── */
  const handleDocUpload = async (file: File) => {
    const ACCEPTED: Record<string, string> = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "image/png": "image", "image/jpeg": "image", "image/webp": "image",
    };
    const fileType = ACCEPTED[file.type];
    if (!fileType) { toast({ title: "Unsupported file", variant: "destructive" }); return; }
    if (file.size > 20 * 1024 * 1024) { toast({ title: "Too large", description: "Max 20MB", variant: "destructive" }); return; }

    setUploadingDoc(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingDoc(false); return; }

    const storagePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file);
    if (uploadError) { toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" }); setUploadingDoc(false); return; }

    const { data: doc, error: docError } = await supabase.from("documents").insert({
      user_id: user.id, filename: file.name, file_url: storagePath, file_type: fileType, status: "processing",
    } as any).select().single();

    if (docError || !doc) { toast({ title: "Error", variant: "destructive" }); setUploadingDoc(false); return; }

    toast({ title: "Processing", description: "AI is reading your document…" });
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ document_id: (doc as any).id }),
      });
      const result = await resp.json();
      if (result.success) {
        toast({ title: "Document Indexed", description: `${result.chunks} chunks created.` });
        onCaptured();
        loadCaptures();
      } else {
        toast({ title: "Processing failed", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setUploadingDoc(false);
  };

  /* ── Save Capture via ingest-capture Edge Function ── */
  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const captureType = mode === "link" ? "url" : mode === "text" ? "note" : mode;

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ type: captureType, content: content.trim(), metadata: {} }),
      });

      const data = await resp.json().catch(() => null);

      if (data?.error === "duplicate_url") {
        toast({
          title: "Duplicate URL",
          description: `You already captured this URL on ${new Date(data.created_at).toLocaleDateString()}.`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      if (!resp.ok) {
        toast({ title: "Capture failed", description: data?.error_message || data?.message || resp.statusText, variant: "destructive" });
      } else {
        toast({ title: "Captured", description: "Processing complete." });
        setContent("");
        onCaptured();
        loadCaptures();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const currentMode = INPUT_MODES.find((m) => m.key === mode)!;

  return (
    <div className="glass-card rounded-2xl card-pad space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <ArrowRight className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-card-title text-foreground">Capture Intelligence</h3>
          <p className="text-meta">Feed your strategic thinking system</p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-4 gap-3">
        {INPUT_MODES.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex flex-col items-center gap-2 py-4 rounded-xl text-sm font-medium transition-all ${
              mode === key ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50 border border-transparent"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>

      {/* Input Area */}
      {mode === "document" ? (
        <div>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = ""; }} />
          <button
            onClick={() => !uploadingDoc && fileInputRef.current?.click()}
            disabled={uploadingDoc}
            className="w-full border-2 border-dashed border-border/30 rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            {uploadingDoc ? <Loader2 className="w-6 h-6 text-primary animate-spin" /> : <FileUp className="w-6 h-6 text-muted-foreground/50" />}
            <span className="text-meta">{uploadingDoc ? "Processing…" : "Click to upload PDF, DOCX, or image"}</span>
          </button>
        </div>
      ) : mode === "voice" ? (
        <div className="flex flex-col items-center gap-4 py-6">
          {isTranscribing ? (
            <div className="flex items-center gap-2 text-body text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" /> Transcribing…
            </div>
          ) : isRecording ? (
            <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center animate-pulse">
              <Square className="w-6 h-6 text-destructive" />
            </button>
          ) : (
            <button onClick={startRecording} className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center hover:bg-primary/20 transition-colors">
              <Mic className="w-7 h-7 text-primary" />
            </button>
          )}
          {content && (
            <div className="w-full bg-secondary/30 rounded-xl p-4 mt-2">
              <p className="text-body text-foreground/80 leading-relaxed" dir="auto">{content}</p>
            </div>
          )}
          <p className="text-meta">{isRecording ? "Tap to stop recording" : "Tap to start recording"}</p>
        </div>
      ) : (
        <div>
          {mode === "link" ? (
            <input
              type="url"
              placeholder={currentMode.placeholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-secondary/30 border border-border/20 rounded-xl px-4 py-4 text-body text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 transition-colors"
            />
          ) : (
            <textarea
              placeholder={currentMode.placeholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              dir="auto"
              className="w-full bg-secondary/30 border border-border/20 rounded-xl px-4 py-4 text-body text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 transition-colors resize-none"
            />
          )}
        </div>
      )}

      {/* Save Button */}
      {mode !== "document" && (
        <button
          onClick={handleSave}
          disabled={saving || !content.trim()}
          className="w-full py-4 rounded-xl bg-primary/10 text-primary text-body font-medium hover:bg-primary/20 transition-colors disabled:opacity-30 border border-primary/15"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Capture"}
        </button>
      )}

      {/* Error State */}
      {fetchError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4">
          <p className="text-sm text-destructive">{fetchError}</p>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !fetchError && (
        <div className="pt-6 border-t border-border/10 space-y-3">
          <Skeleton className="h-4 w-32" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3 px-4 rounded-lg bg-secondary/20">
              <Skeleton className="w-8 h-8 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !fetchError && captures.length === 0 && (
        <div className="pt-6 border-t border-border/10 flex flex-col items-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="w-6 h-6 text-primary/60" />
          </div>
          <p className="text-body text-muted-foreground text-center max-w-xs">
            Your intelligence starts here. Capture something you read today.
          </p>
          <button
            onClick={() => setMode("link")}
            className="px-6 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors border border-primary/15"
          >
            Start Capturing
          </button>
        </div>
      )}

      {/* Captures List */}
      {!loading && !fetchError && captures.length > 0 && (
        <div className="pt-6 border-t border-border/10 space-y-3">
          <p className="text-label">Recent Captures</p>
          {captures.map((c) => {
            const Icon = TYPE_ICONS[c.type] || Type;
            return (
              <div key={c.id} className="flex items-center gap-3 py-3 px-4 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                <div className="w-8 h-8 rounded-md bg-primary/8 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body text-foreground truncate" dir="auto">
                    {captureTitle(c)}
                  </p>
                  <span className="text-meta">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <Badge
                  className={`text-[10px] border ${statusColor(c.processing_status)}`}
                  variant="outline"
                >
                  {c.processing_status}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CaptureIntelligencePanel;
