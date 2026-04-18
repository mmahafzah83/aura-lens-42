import { useState, useRef, useEffect } from "react";
import { FileUp, FileText, Image as ImageIcon, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Button } from "@/components/ui/button";

interface DocumentUploadProps {
  onUploaded?: () => void;
}

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const DocumentUpload = ({ onUploaded }: DocumentUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [fileName, setFileName] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [duplicate, setDuplicate] = useState<{ filename: string; date: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const pollIntervalRef = useRef<number | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
  };

  const pollStatus = (documentId: string, filename: string) => {
    stopPolling();
    pollIntervalRef.current = window.setInterval(async () => {
      const { data } = await supabase
        .from("documents")
        .select("status, summary, page_count")
        .eq("id", documentId)
        .maybeSingle();
      if (!data) return;
      if (data.status === "completed" || data.status === "ready") {
        stopPolling();
        if (toastIdRef.current) sonnerToast.dismiss(toastIdRef.current);
        sonnerToast.success(`✓ ${filename} processed successfully — ${data.page_count ?? 0} pages captured`, {
          duration: 4000,
        });
        setStatus("done");
        onUploaded?.();
      } else if (data.status === "error") {
        stopPolling();
        if (toastIdRef.current) sonnerToast.dismiss(toastIdRef.current);
        sonnerToast.error(`Could not process ${filename}. Try uploading again or use a different format.`, {
          duration: Infinity,
        });
        setStatus("error");
      }
    }, 5000);

    pollTimeoutRef.current = window.setTimeout(() => {
      stopPolling();
      if (toastIdRef.current) sonnerToast.dismiss(toastIdRef.current);
      sonnerToast.error(`Processing ${filename} timed out. Try uploading again.`, { duration: Infinity });
      setStatus("error");
    }, 60000);
  };

  const checkDuplicate = async (file: File): Promise<{ filename: string; date: string } | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("documents")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("filename", file.name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { filename: file.name, date: fmtDate(data.created_at) };
    return null;
  };

  const handleFile = async (file: File) => {
    const fileType = ACCEPTED_TYPES[file.type];
    if (!fileType) {
      toast({ title: "Unsupported file", description: "Upload PDF, DOCX, PNG, JPG, or WebP files.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Too large", description: "File must be under 20MB.", variant: "destructive" });
      return;
    }

    // Duplicate check
    const dup = await checkDuplicate(file);
    if (dup) {
      setPendingFile(file);
      setDuplicate(dup);
      return;
    }

    await processUpload(file, fileType);
  };

  const processUpload = async (file: File, fileType: string) => {
    setDuplicate(null);
    setPendingFile(null);
    setFileName(file.name);
    setUploading(true);
    setStatus("uploading");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      setUploading(false);
      setStatus("error");
      return;
    }

    // Upload to storage
    const storagePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file);

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      setStatus("error");
      return;
    }

    // Create document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        filename: file.name,
        file_url: storagePath,
        file_type: fileType,
        status: "processing",
      } as any)
      .select()
      .single();

    if (docError || !doc) {
      toast({ title: "Error", description: docError?.message || "Could not create document record", variant: "destructive" });
      setUploading(false);
      setStatus("error");
      return;
    }

    setStatus("processing");

    // Persistent processing toast
    toastIdRef.current = sonnerToast.loading(`Processing ${file.name}… this may take a minute`, {
      duration: Infinity,
    });

    // Trigger ingestion via Supabase invoke (auth handled, errors surfaced)
    const { data: invokeData, error: invokeError } = await supabase.functions.invoke(
      "ingest-document",
      { body: { document_id: (doc as any).id } },
    );
    if (invokeError) {
      console.error("[DocumentUpload] ingest-document invoke error:", invokeError);
      sonnerToast.error(`Could not start processing for ${file.name}: ${invokeError.message || "unknown error"}`, {
        duration: 6000,
      });
      // Mark the row as errored so the UI offers retry
      await supabase
        .from("documents")
        .update({ status: "error", error_message: `Trigger failed: ${invokeError.message || "unknown"}` } as any)
        .eq("id", (doc as any).id);
      setStatus("error");
      setUploading(false);
      onUploaded?.();
      return;
    }
    console.log("[DocumentUpload] ingest-document invoke ok:", invokeData);

    setUploading(false);
    onUploaded?.();
    pollStatus((doc as any).id, file.name);
  };

  const reset = () => {
    setStatus("idle");
    setFileName("");
    setUploading(false);
    setPendingFile(null);
    setDuplicate(null);
  };

  const statusIcon = {
    idle: <FileUp className="w-8 h-8 text-muted-foreground" />,
    uploading: <Loader2 className="w-8 h-8 text-primary animate-spin" />,
    processing: <Loader2 className="w-8 h-8 text-primary animate-spin" />,
    done: <CheckCircle className="w-8 h-8" style={{ color: "#7ab648" }} />,
    error: <AlertCircle className="w-8 h-8 text-destructive" />,
  };

  const statusText = {
    idle: "Upload PDF, DOCX, or high-res image",
    uploading: "Uploading…",
    processing: "AI is reading & chunking…",
    done: `${fileName} indexed successfully`,
    error: "Something went wrong",
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div
        onClick={() => !uploading && !duplicate && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
          uploading ? "border-primary/30 bg-primary/5" : "border-border/40 hover:border-primary/50"
        }`}
      >
        {statusIcon[status]}
        <p className="text-sm text-foreground mt-3">{statusText[status]}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> DOCX</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image</span>
        </div>
      </div>

      {duplicate && pendingFile && (
        <div
          style={{
            background: "rgba(239, 159, 39, 0.1)",
            border: "0.5px solid rgba(239, 159, 39, 0.4)",
            borderRadius: 6,
            padding: "8px 12px",
          }}
        >
          <p className="text-foreground" style={{ fontSize: 12, fontWeight: 400, margin: 0 }}>
            You already uploaded {duplicate.filename} on {duplicate.date}.
          </p>
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => processUpload(pendingFile, ACCEPTED_TYPES[pendingFile.type])}
              style={{ fontSize: 11, color: "#EF9F27", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            >
              Upload again
            </button>
            <button
              type="button"
              onClick={() => { setDuplicate(null); setPendingFile(null); }}
              className="text-muted-foreground"
              style={{ fontSize: 11, background: "transparent", border: "none", marginLeft: 12, cursor: "pointer", padding: 0 }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {(status === "done" || status === "error") && (
        <Button variant="ghost" size="sm" onClick={reset} className="w-full text-xs">
          <X className="w-3 h-3 me-1" /> Upload another
        </Button>
      )}
    </div>
  );
};

export default DocumentUpload;
