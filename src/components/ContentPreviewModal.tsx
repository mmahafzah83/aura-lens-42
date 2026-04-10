import { useState } from "react";
import { X, Copy, Save, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  contentItem: {
    id: string;
    title: string;
    body: string;
    type: string;
    status: string;
  } | null;
}

const TYPE_LABELS: Record<string, string> = {
  linkedin_post: "LinkedIn Post",
  carousel: "Carousel",
  framework: "Framework",
  article: "Article",
  whitepaper: "Whitepaper",
};

const ContentPreviewModal = ({ open, onClose, contentItem }: ContentPreviewModalProps) => {
  const [saving, setSaving] = useState(false);

  if (!open || !contentItem) return null;

  const handleCopy = async () => {
    try {
      const plain = contentItem.body.replace(/<[^>]*>/g, "").replace(/[*_#`]/g, "");
      await navigator.clipboard.writeText(plain);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("content_items" as any)
        .update({ status: "draft" } as any)
        .eq("id", contentItem.id);
      if (error) throw error;
      toast.success("Saved as draft");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    try {
      await supabase
        .from("content_items" as any)
        .update({ status: "discarded" } as any)
        .eq("id", contentItem.id);
      toast.success("Content discarded");
      onClose();
    } catch {
      toast.error("Failed to discard");
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 580, maxWidth: "90vw", maxHeight: "88vh",
          background: "#111111", borderRadius: 16,
          border: "1px solid #2a2a2a", overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <span style={{ fontSize: 10, color: "#C5A55A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {TYPE_LABELS[contentItem.type] || contentItem.type}
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#f0f0f0", marginTop: 4 }}>
              {contentItem.title}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflow: "auto", padding: "20px",
        }}>
          <div style={{
            whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7,
            color: "#d0d0d0", fontFamily: "inherit",
          }}>
            {contentItem.body}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: "16px 20px", borderTop: "1px solid #1a1a1a",
          display: "flex", gap: 8,
        }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 10,
              background: "#1a1a1a", color: "#f0f0f0", fontSize: 13,
              fontWeight: 500, border: "1px solid #2a2a2a", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Copy size={14} /> Copy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 10,
              background: "#C5A55A", color: "#0d0d0d", fontSize: 13,
              fontWeight: 600, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
          <button
            onClick={handleDiscard}
            style={{
              padding: "10px 16px", borderRadius: 10,
              background: "transparent", color: "#888", fontSize: 13,
              fontWeight: 500, border: "1px solid #2a2a2a", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Trash2 size={14} /> Discard
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContentPreviewModal;
