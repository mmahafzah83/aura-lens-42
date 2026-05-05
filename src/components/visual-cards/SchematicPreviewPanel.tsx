import { useRef, useState } from "react";
import { Download, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SchematicRenderer, { SchematicSpec } from "./SchematicRenderer";
import { exportCardAsPng, downloadBlob } from "./exportCard";

interface SchematicPreviewPanelProps {
  postText: string;
  topicLabel?: string;
  language: 'en' | 'ar';
  authorName: string;
  authorTitle: string;
}

export default function SchematicPreviewPanel(props: SchematicPreviewPanelProps) {
  const { postText, topicLabel, language, authorName, authorTitle } = props;
  const [spec, setSpec] = useState<SchematicSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("generate-schematic-spec", {
        body: {
          post_text: postText,
          language,
          author_name: authorName,
          author_title: authorTitle,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (!data?.success || !data.spec) throw new Error(data?.error || "Failed to generate schematic");
      setSpec(data.spec as SchematicSpec);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate schematic");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!wrapperRef.current) return;
    setExporting(true);
    try {
      const blob = await exportCardAsPng(wrapperRef.current, "aura-schematic.png");
      if (!blob) throw new Error("Export failed");
      const safe = (topicLabel || spec?.title || "schematic").replace(/\s+/g, "-").slice(0, 40);
      downloadBlob(blob, `aura-schematic-${safe}.png`);
    } catch (e: any) {
      toast.error(e.message || "Failed to download");
    } finally {
      setExporting(false);
    }
  };

  if (!spec && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <p className="text-xs text-muted-foreground/60">
          Turn this post into a strategic diagram on the Aura blackboard.
        </p>
        <button
          type="button"
          onClick={generate}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11px] font-medium border"
          style={{ borderColor: "var(--brand)", color: "var(--brand)" }}
        >
          <Sparkles className="w-3.5 h-3.5" /> Generate Schematic
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 text-primary/60 animate-spin" />
        <p className="text-xs text-muted-foreground/60">Designing your diagram…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="w-full overflow-y-auto bg-surface-ink p-4" style={{ maxHeight: "60vh" }}>
        <div
          ref={wrapperRef}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          style={{
            width: 1080,
            height: 1350,
            transformOrigin: "top center",
            transform: "scale(0.42)",
            margin: "0 auto",
          }}
        >
          {spec && <SchematicRenderer spec={spec} language={language} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-border/8 bg-secondary/10">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] border border-border/15 hover:border-primary/40"
        >
          <RefreshCw className="w-3 h-3" /> Regenerate
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] border border-border/15 hover:border-primary/40"
        >
          {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Download PNG
        </button>
      </div>
    </div>
  );
}
