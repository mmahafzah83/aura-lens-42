import { useState, useRef } from "react";
import { FileUp, FileText, Image as ImageIcon, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

const DocumentUpload = ({ onUploaded }: DocumentUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
    toast({ title: "Processing", description: "AI is reading and chunking your document…" });

    // Trigger ingestion
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ document_id: (doc as any).id }),
        }
      );

      const result = await resp.json();
      if (result.success) {
        setStatus("done");
        toast({
          title: "Document Indexed",
          description: `${result.chunks} chunks created. Aura can now search this document.`,
        });
        onUploaded?.();
      } else {
        setStatus("error");
        toast({ title: "Processing failed", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      setStatus("error");
      toast({ title: "Error", description: e.message || "Ingestion failed", variant: "destructive" });
    }

    setUploading(false);
  };

  const reset = () => {
    setStatus("idle");
    setFileName("");
    setUploading(false);
  };

  const statusIcon = {
    idle: <FileUp className="w-8 h-8 text-muted-foreground" />,
    uploading: <Loader2 className="w-8 h-8 text-primary animate-spin" />,
    processing: <Loader2 className="w-8 h-8 text-primary animate-spin" />,
    done: <CheckCircle className="w-8 h-8 text-green-500" />,
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
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
          uploading ? "border-primary/30 bg-primary/5" : "border-border/40 hover:border-primary/50"
        }`}
      >
        {statusIcon[status]}
        <p className="text-sm text-muted-foreground mt-3">{statusText[status]}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> DOCX</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image</span>
        </div>
      </div>

      {(status === "done" || status === "error") && (
        <Button variant="ghost" size="sm" onClick={reset} className="w-full text-xs">
          <X className="w-3 h-3 me-1" /> Upload another
        </Button>
      )}
    </div>
  );
};

export default DocumentUpload;
